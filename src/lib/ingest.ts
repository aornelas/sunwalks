import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { days, photos, syncLog } from "@/db/schema";
import { getOwnerAccount, getValidAccessToken } from "./owner";
import { searchAlbumMediaItems, type GoogleMediaItem } from "./google";
import { env } from "./env";
import { localDayKey } from "./dates";

export async function runSync(): Promise<{ photosAdded: number }> {
  const account = await getOwnerAccount();
  if (!account) throw new Error("No owner account connected");
  if (!account.albumId) throw new Error("No album selected");

  const [logRow] = await db.insert(syncLog).values({ status: "running" }).returning();

  try {
    const accessToken = await getValidAccessToken();
    let added = 0;
    const touchedDays = new Set<string>();

    await searchAlbumMediaItems(accessToken, account.albumId, async (items: GoogleMediaItem[]) => {
      for (const item of items) {
        const takenAt = new Date(item.mediaMetadata.creationTime);
        const dayKey = localDayKey(takenAt, env.timezone);
        touchedDays.add(dayKey);

        const result = await db
          .insert(photos)
          .values({
            id: item.id,
            date: dayKey,
            takenAt,
            filename: item.filename,
            width: item.mediaMetadata.width ? Number(item.mediaMetadata.width) : null,
            height: item.mediaMetadata.height ? Number(item.mediaMetadata.height) : null,
          })
          .onConflictDoNothing({ target: photos.id })
          .returning({ id: photos.id });
        if (result.length > 0) added++;
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

    await db
      .update(syncLog)
      .set({ status: "ok", finishedAt: new Date(), photosAdded: added })
      .where(eq(syncLog.id, logRow.id));

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
