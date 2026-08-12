import { and, gte, lte, eq } from "drizzle-orm";
import { db } from "@/db";
import { days, photos } from "@/db/schema";
import { env } from "./env";
import { formatTime } from "./dates";
import type { Shot, DayData } from "./types";

function toShot(p: typeof photos.$inferSelect): Shot {
  return {
    id: p.id,
    url: `/api/photos/${p.id}/image?size=full`,
    thumbUrl: `/api/photos/${p.id}/image?size=sq`,
    takenAt: p.takenAt.toISOString(),
    place: p.place ?? undefined,
  };
}

export async function getDaysInRange(startKey: string, endKey: string): Promise<DayData[]> {
  const [dayRows, photoRows] = await Promise.all([
    db.select().from(days).where(and(gte(days.date, startKey), lte(days.date, endKey))),
    db.select().from(photos).where(and(gte(photos.date, startKey), lte(photos.date, endKey))),
  ]);

  const shotsByDate = new Map<string, Shot[]>();
  for (const p of photoRows) {
    const list = shotsByDate.get(p.date) ?? [];
    list.push(toShot(p));
    shotsByDate.set(p.date, list);
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

export async function getDay(dayKey: string): Promise<DayData | undefined> {
  const rows = await getDaysInRange(dayKey, dayKey);
  return rows[0];
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
