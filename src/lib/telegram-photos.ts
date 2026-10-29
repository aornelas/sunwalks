// A photo sent to the walk buddy becomes a photo in the calendar: the same
// two derivatives a Google Photos import stores (see ingest.ts), a photos
// row on the morning it belongs to, and a tag from Claude.
//
// Which morning: a photo sent as a file keeps its EXIF, so the time it was
// taken decides. A normal Telegram photo arrives stripped, so it goes on
// the day it was sent unless the owner's words say otherwise (movePhoto).
// The stored derivatives carry no metadata at all, GPS included.

import type Anthropic from "@anthropic-ai/sdk";
import { toFile } from "@anthropic-ai/sdk";
import exifReader from "exif-reader";
import { and, asc, eq, ne } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/db";
import { days, photos } from "@/db/schema";
import { localDayKey, wallClockToInstant } from "./dates";
import { env } from "./env";
import { getPhotoSource } from "./photo-source";
import { sunriseOn } from "./schedule";
import { saveImage as saveToBlob } from "./storage";
import { tagPhoto, type PhotoTag, type TagUsage } from "./tagging";
import type { TelegramApi } from "./telegram";

export interface ImportedPhoto {
  id: string;
  date: string;
  /** True when the date came from the file's own record of when it was taken. */
  datedByExif: boolean;
  tag: PhotoTag;
  usage: TagUsage;
}

/** When the photo was taken, from EXIF, or null when the file doesn't say. */
export function takenAtFromExif(exif: Buffer | undefined, timeZone: string): Date | null {
  if (!exif) return null;
  let parsed: ReturnType<typeof exifReader>;
  try {
    parsed = exifReader(exif);
  } catch {
    return null;
  }
  const wall = parsed.Photo?.DateTimeOriginal;
  if (!(wall instanceof Date) || Number.isNaN(wall.getTime())) return null;
  // exif-reader reads the local wall time as if it were UTC. An offset tag,
  // when the camera wrote one, pins it exactly; otherwise it's owner-local.
  const offset = /^([+-])(\d{2}):(\d{2})$/.exec(parsed.Photo?.OffsetTimeOriginal ?? "");
  if (offset) {
    const minutes = (Number(offset[2]) * 60 + Number(offset[3])) * (offset[1] === "-" ? -1 : 1);
    return new Date(wall.getTime() - minutes * 60_000);
  }
  return wallClockToInstant(wall, timeZone);
}

/** Makes `id` a day's shot if it has none, and fixes the day it left. */
async function placeInDays(id: string, date: string, previousDate?: string): Promise<void> {
  await db.insert(days).values({ date, dayShotId: id }).onConflictDoNothing();
  const [day] = await db.select().from(days).where(eq(days.date, date)).limit(1);
  if (day && !day.dayShotId) await db.update(days).set({ dayShotId: id }).where(eq(days.date, date));
  if (!previousDate || previousDate === date) return;
  const [old] = await db.select().from(days).where(eq(days.date, previousDate)).limit(1);
  if (old?.dayShotId !== id) return;
  const [next] = await db
    .select({ id: photos.id })
    .from(photos)
    .where(and(eq(photos.date, previousDate), ne(photos.id, id)))
    .orderBy(asc(photos.takenAt))
    .limit(1);
  if (next) await db.update(days).set({ dayShotId: next.id }).where(eq(days.date, previousDate));
  else await db.delete(days).where(eq(days.date, previousDate));
}

/**
 * Downloads, stores and tags one image. A photo already imported (Telegram's
 * file_unique_id is stable) is re-tagged, not duplicated.
 */
export async function importTelegramPhoto(
  deps: { api: TelegramApi; client: Anthropic; saveImage?: (key: string, bytes: Buffer) => Promise<void> },
  image: { fileId: string; uniqueId: string },
  sentAt: Date,
  places: string[],
): Promise<ImportedPhoto> {
  const save = deps.saveImage ?? saveToBlob;
  const id = `tg-${image.uniqueId}`;

  const file = await deps.api.call<{ file_path?: string }>("getFile", { file_id: image.fileId });
  if (!file.file_path) throw new Error("Telegram didn't return a path for the photo");
  const original = await deps.api.download(file.file_path);

  const exifTakenAt = takenAtFromExif((await sharp(original).metadata()).exif, env.timezone);
  const takenAt = exifTakenAt ?? sentAt;
  const date = localDayKey(takenAt, env.timezone);

  // The same shapes ingest.ts asks Google for: a 480px square crop for the
  // grid, and up to 1600px wide for the full view and for tagging. sharp
  // drops all metadata from its output unless asked to keep it.
  const [sq, full] = await Promise.all([
    sharp(original).rotate().resize(480, 480, { fit: "cover" }).jpeg({ quality: 82 }).toBuffer(),
    sharp(original).rotate().resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer(),
  ]);
  const { width, height } = await sharp(full).metadata();
  await Promise.all([save(`${id}-sq.jpg`, sq), save(`${id}-full.jpg`, full)]);

  // Uploaded here, from the bytes in hand, so tagging doesn't read them back.
  const uploaded = await deps.client.files.upload({ file: await toFile(full, `${id}.jpg`, { type: "image/jpeg" }) });
  const [existing] = await db.select({ date: photos.date }).from(photos).where(eq(photos.id, id)).limit(1);
  const row = {
    id,
    date,
    takenAt,
    filename: `telegram-${date}.jpg`,
    width: width ?? null,
    height: height ?? null,
    claudeFileId: uploaded.id,
  };
  await db.insert(photos).values(row).onConflictDoUpdate({ target: photos.id, set: row });
  await placeInDays(id, date, existing?.date);

  const { tag, usage } = await tagPhoto(deps.client, getPhotoSource(), { id, claudeFileId: uploaded.id }, places);
  return { id, date, datedByExif: exifTakenAt != null, tag, usage };
}

/**
 * Files a photo under another morning, for one sent late without its EXIF
 * ("this is from Tuesday"). With no real time to go on, it's stamped at
 * that morning's sunrise.
 */
export async function movePhoto(id: string, date: string): Promise<void> {
  const [photo] = await db.select({ date: photos.date }).from(photos).where(eq(photos.id, id)).limit(1);
  if (!photo || photo.date === date) return;
  await db
    .update(photos)
    .set({ date, takenAt: sunriseOn(date), filename: `telegram-${date}.jpg` })
    .where(eq(photos.id, id));
  await placeInDays(id, date, photo.date);
}
