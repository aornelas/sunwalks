import { and, gte, lte, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { days, photoTags, photos } from "@/db/schema";
import { env } from "./env";
import { formatTime } from "./dates";
import type { VerdictWord } from "./verdict";
import type { Shot, DayData } from "./types";

interface ShotRow {
  photo: typeof photos.$inferSelect;
  tags: { altText: string; observedCategory: string } | null;
}

/**
 * `includePlace` is false for the share link: places are where the owner
 * is at sunrise most days, so a viewer never gets them (or a filter by them).
 */
function toShot({ photo: p, tags }: ShotRow, includePlace: boolean): Shot {
  return {
    id: p.id,
    url: `/api/photos/${p.id}/image?size=full`,
    thumbUrl: `/api/photos/${p.id}/image?size=sq`,
    takenAt: p.takenAt.toISOString(),
    place: includePlace ? (p.place ?? undefined) : undefined,
    alt: tags?.altText,
    category: tags?.observedCategory as VerdictWord | undefined,
  };
}

export async function getDaysInRange(
  startKey: string,
  endKey: string,
  { includePlace }: { includePlace: boolean },
): Promise<DayData[]> {
  const [dayRows, photoRows] = await Promise.all([
    db.select().from(days).where(and(gte(days.date, startKey), lte(days.date, endKey))),
    db
      .select({
        photo: photos,
        tags: { altText: photoTags.altText, observedCategory: photoTags.observedCategory },
      })
      .from(photos)
      .leftJoin(photoTags, eq(photoTags.photoId, photos.id))
      .where(and(gte(photos.date, startKey), lte(photos.date, endKey))),
  ]);

  const shotsByDate = new Map<string, Shot[]>();
  for (const row of photoRows) {
    const list = shotsByDate.get(row.photo.date) ?? [];
    list.push(toShot(row, includePlace));
    shotsByDate.set(row.photo.date, list);
  }
  for (const list of shotsByDate.values()) {
    list.sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  }

  return dayRows
    .map((d) => ({
      date: d.date,
      shots: shotsByDate.get(d.date) ?? [],
      dayShotId: d.dayShotId,
    }))
    .filter((d) => d.shots.length > 0);
}

/** Every place the owner has named, for the calendar's place filter. Owner-only. */
export async function getPlaces(): Promise<string[]> {
  const rows = await db.selectDistinct({ place: photos.place }).from(photos).where(isNotNull(photos.place));
  return rows.map((r) => r.place!).sort((a, b) => a.localeCompare(b));
}

export async function getAllCapturedDayKeys(): Promise<string[]> {
  const rows = await db.select({ date: days.date }).from(days);
  return rows.map((r) => r.date).sort();
}

export async function setDayPhoto(dayKey: string, shotId: string): Promise<void> {
  const [photo] = await db.select().from(photos).where(eq(photos.id, shotId)).limit(1);
  if (!photo || photo.date !== dayKey) {
    throw new Error("Shot does not belong to that day");
  }
  await db.update(days).set({ dayShotId: shotId }).where(eq(days.date, dayKey));
}

export function formatCaptureTime(takenAtIso: string): string {
  return formatTime(new Date(takenAtIso), env.timezone);
}
