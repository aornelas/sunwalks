import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { days, photos, syncLog } from "@/db/schema";
import { getValidAccessToken, markPicked } from "./owner";
import { deletePickerSession, listPickerMediaItems, type PickedMediaItem } from "./google";
import { env } from "./env";
import { localDayKey } from "./dates";
import { saveImage } from "./storage";

const SQ_SUFFIX = "=w480-h480-c";
const FULL_SUFFIX = "=w1600";

/**
 * Imports whatever the owner picked in a completed Picker session. Unlike
 * the old Library API flow, this is a one-shot, user-initiated action, not
 * something a cron job can run unattended — see ANDROID_UPDATE.md
 * discussion and the note atop src/lib/google.ts. Each item's baseUrl is
 * only valid while the session is alive, so both derivatives are downloaded
 * and stored locally here rather than proxied on demand later.
 */
export async function importFromPickerSession(sessionId: string): Promise<{ photosAdded: number }> {
  const [logRow] = await db.insert(syncLog).values({ status: "running" }).returning();

  try {
    const accessToken = await getValidAccessToken();
    let added = 0;
    const touchedDays = new Set<string>();

    await listPickerMediaItems(accessToken, sessionId, async (items: PickedMediaItem[]) => {
      for (const item of items) {
        const existing = await db.select({ id: photos.id }).from(photos).where(eq(photos.id, item.id)).limit(1);
        if (existing.length > 0) continue; // already imported in a previous session

        const takenAt = new Date(item.createTime);
        const dayKey = localDayKey(takenAt, env.timezone);
        const { baseUrl } = item.mediaFile;

        // Like the old Library API, baseUrl content requires the owner's
        // OAuth bearer token on the request — it 403s without it even
        // though the URL itself looks directly fetchable.
        const authHeaders = { Authorization: `Bearer ${accessToken}` };
        const [sqRes, fullRes] = await Promise.all([
          fetch(`${baseUrl}${SQ_SUFFIX}`, { headers: authHeaders }),
          fetch(`${baseUrl}${FULL_SUFFIX}`, { headers: authHeaders }),
        ]);
        if (!sqRes.ok || !fullRes.ok) {
          throw new Error(
            `Failed to download derivatives for picked item ${item.id} (sq: ${sqRes.status}, full: ${fullRes.status})`,
          );
        }
        await Promise.all([
          saveImage(`${item.id}-sq.jpg`, Buffer.from(await sqRes.arrayBuffer())),
          saveImage(`${item.id}-full.jpg`, Buffer.from(await fullRes.arrayBuffer())),
        ]);

        await db.insert(photos).values({
          id: item.id,
          date: dayKey,
          takenAt,
          filename: item.mediaFile.filename,
          width: item.mediaFile.mediaFileMetadata?.width ?? null,
          height: item.mediaFile.mediaFileMetadata?.height ?? null,
        });
        touchedDays.add(dayKey);
        added++;
      }
    });

    // Ensure every touched day has a `days` row; leave an existing
    // owner-chosen dayShotId alone, default new days to their earliest shot.
    for (const dayKey of touchedDays) {
      const [existing] = await db.select().from(days).where(eq(days.date, dayKey)).limit(1);
      if (existing) continue;
      const [firstShot] = await db
        .select({ id: photos.id })
        .from(photos)
        .where(eq(photos.date, dayKey))
        .orderBy(photos.takenAt)
        .limit(1);
      await db.insert(days).values({ date: dayKey, dayShotId: firstShot?.id ?? null });
    }

    await markPicked();
    await db
      .update(syncLog)
      .set({ status: "ok", finishedAt: new Date(), photosAdded: added })
      .where(eq(syncLog.id, logRow.id));

    await deletePickerSession(accessToken, sessionId);

    return { photosAdded: added };
  } catch (err) {
    await db
      .update(syncLog)
      .set({
        status: "error",
        finishedAt: new Date(),
        error: err instanceof Error ? err.message : String(err),
      })
      .where(eq(syncLog.id, logRow.id));
    throw err;
  }
}

export async function getLatestSyncLog() {
  const [row] = await db.select().from(syncLog).orderBy(sql`${syncLog.id} desc`).limit(1);
  return row;
}
