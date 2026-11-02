// A photo sent to the walk buddy becomes a photo in the calendar: the same
// two derivatives a Google Photos import stores (see ingest.ts), a photos
// row on the morning it belongs to, and a tag from Claude.
//
// Which morning: a photo sent as a file keeps its EXIF, so the time it was
// taken decides. A normal Telegram photo arrives stripped, so it goes on
// the day it was sent unless the owner's words say otherwise (movePhoto),
// and its time is a guess: when it was sent if that was soon after
// sunrise, otherwise sunrise itself, until the owner says (setPhotoTime).
// The stored derivatives carry no metadata at all, GPS included.

import type Anthropic from "@anthropic-ai/sdk";
import { toFile } from "@anthropic-ai/sdk";
import exifReader from "exif-reader";
import { and, asc, desc, eq, gte, like, ne } from "drizzle-orm";
import decodeHeic from "heic-decode";
import sharp from "sharp";
import { db } from "@/db";
import { days, photos } from "@/db/schema";
import { localDayKey, wallClockToInstant, zonedTimeToInstant } from "./dates";
import { env } from "./env";
import { getPhotoSource } from "./photo-source";
import { sunriseOn } from "./schedule";
import { deleteImage, saveImage as saveToBlob } from "./storage";
import { tagPhoto, type PhotoTag, type TagUsage } from "./tagging";
import type { TelegramApi } from "./telegram";

export interface ImportedPhoto {
  id: string;
  date: string;
  takenAt: Date;
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

/** A photo sent within this long of sunrise was most likely sent from the spot. */
export const SENT_ON_THE_SPOT_MINUTES = 120;

/**
 * The best guess at when a photo with no EXIF was taken: the moment it was
 * sent, unless that was well after sunrise (shared that afternoon, say),
 * when sunrise is closer to the truth.
 */
export function takenAtWithoutExif(sentAt: Date, sunrise: Date): Date {
  return sentAt.getTime() - sunrise.getTime() > SENT_ON_THE_SPOT_MINUTES * 60_000 ? sunrise : sentAt;
}

/** True for HEIC, by the file's own brand: iPhone originals sent as files. */
export function isHeic(bytes: Buffer): boolean {
  return bytes.toString("latin1", 4, 8) === "ftyp" && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(bytes.toString("latin1", 8, 12));
}

/** Bytes sharp can open: its prebuilt binary reads HEIC's header (EXIF included) but can't decode HEVC. */
async function decodable(original: Buffer): Promise<Buffer> {
  if (!isHeic(original)) return original;
  const { width, height, data } = await decodeHeic({ buffer: original });
  return sharp(Buffer.from(data), { raw: { width, height, channels: 4 } }).jpeg({ quality: 95 }).toBuffer();
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
  const downloaded = await deps.api.download(file.file_path);

  const exifTakenAt = takenAtFromExif((await sharp(downloaded).metadata()).exif, env.timezone);
  const original = await decodable(downloaded);
  const sentDate = localDayKey(sentAt, env.timezone);
  const takenAt = exifTakenAt ?? takenAtWithoutExif(sentAt, sunriseOn(sentDate));
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
  return { id, date, takenAt, datedByExif: exifTakenAt != null, tag, usage };
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

/** Sets the time a photo was taken, from the owner's words ("taken at 7:52"), on the morning it's filed under. */
export async function setPhotoTime(id: string, hhmm: string): Promise<Date | null> {
  const [photo] = await db.select({ date: photos.date }).from(photos).where(eq(photos.id, id)).limit(1);
  if (!photo) return null;
  const takenAt = zonedTimeToInstant(photo.date, hhmm, env.timezone);
  await db.update(photos).set({ takenAt }).where(eq(photos.id, id));
  return takenAt;
}

/** A replacement can follow its photo: "replace the other one" right after sending it. */
const REPLACEMENT_WINDOW_MS = 60 * 60_000;

/** The Telegram photo just sent for a morning, when the words asking to replace come in a later message. */
export async function recentTelegramPhoto(date: string, now: Date): Promise<string | null> {
  const [row] = await db
    .select({ id: photos.id })
    .from(photos)
    .where(and(eq(photos.date, date), like(photos.id, "tg-%"), gte(photos.createdAt, new Date(now.getTime() - REPLACEMENT_WINDOW_MS))))
    .orderBy(desc(photos.createdAt))
    .limit(1);
  return row?.id ?? null;
}

/**
 * Which of a morning's other photos a replacement removes. One is unambiguous;
 * several need the owner to say all of them.
 */
export function photosToRemove<T>(others: T[], all: boolean): T[] | "ask" {
  return others.length > 1 && !all ? "ask" : others;
}

export type ReplaceResult =
  | { status: "replaced"; removed: number }
  | { status: "ask"; others: { id: string; takenAt: Date }[] }
  | { status: "nothing_to_replace" };

/**
 * Makes `keepId` the morning's photo in place of the others, for a better
 * copy of a shot. It inherits their confirmed place, and their time unless
 * it keeps its own (its EXIF has one, or it came in an earlier message and
 * may have). The old copies go for good: stored files, the upload
 * to Claude, and (by cascade) their tags.
 */
export async function replacePhotos(
  client: Anthropic,
  keepId: string,
  date: string,
  opts: { all: boolean; keepOwnTime: boolean },
): Promise<ReplaceResult> {
  const others = await db
    .select()
    .from(photos)
    .where(and(eq(photos.date, date), ne(photos.id, keepId)))
    .orderBy(asc(photos.takenAt));
  if (others.length === 0) return { status: "nothing_to_replace" };
  const remove = photosToRemove(others, opts.all);
  if (remove === "ask") return { status: "ask", others: others.map((o) => ({ id: o.id, takenAt: o.takenAt })) };

  const [keep] = await db.select().from(photos).where(eq(photos.id, keepId)).limit(1);
  await db
    .update(photos)
    .set({
      place: keep?.place ?? remove[0].place,
      ...(opts.keepOwnTime ? {} : { takenAt: remove[0].takenAt }),
    })
    .where(eq(photos.id, keepId));
  await db.update(days).set({ dayShotId: keepId }).where(eq(days.date, date));
  for (const old of remove) {
    await db.delete(photos).where(eq(photos.id, old.id));
    await Promise.all([deleteImage(`${old.id}-sq.jpg`), deleteImage(`${old.id}-full.jpg`)]);
    if (old.claudeFileId) await client.files.delete(old.claudeFileId).catch(() => {});
  }
  return { status: "replaced", removed: remove.length };
}
