// A photo sent to the walk buddy becomes a photo in the calendar: the same
// two derivatives a Google Photos import stores (see ingest.ts), a photos
// row on the morning it was sent, and a tag from Claude.

import type Anthropic from "@anthropic-ai/sdk";
import { toFile } from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/db";
import { days, photos } from "@/db/schema";
import { getPhotoSource } from "./photo-source";
import { saveImage as saveToBlob } from "./storage";
import { tagPhoto, type PhotoTag, type TagUsage } from "./tagging";
import { largestPhoto, type PhotoSize, type TelegramApi } from "./telegram";

export interface ImportedPhoto {
  id: string;
  tag: PhotoTag;
  usage: TagUsage;
}

/**
 * Downloads, stores and tags one photo. Telegram strips EXIF, so the
 * message's own time stands in for when it was taken. A photo already
 * imported (Telegram's file_unique_id is stable) is re-tagged, not duplicated.
 */
export async function importTelegramPhoto(
  deps: { api: TelegramApi; client: Anthropic; saveImage?: (key: string, bytes: Buffer) => Promise<void> },
  sizes: PhotoSize[],
  sentAt: Date,
  date: string,
  places: string[],
): Promise<ImportedPhoto> {
  const save = deps.saveImage ?? saveToBlob;
  const photo = largestPhoto(sizes);
  const id = `tg-${photo.file_unique_id}`;

  const file = await deps.api.call<{ file_path?: string }>("getFile", { file_id: photo.file_id });
  if (!file.file_path) throw new Error("Telegram didn't return a path for the photo");
  const original = await deps.api.download(file.file_path);

  // The same shapes ingest.ts asks Google for: a 480px square crop for the
  // grid, and up to 1600px wide for the full view and for tagging.
  const [sq, full] = await Promise.all([
    sharp(original).rotate().resize(480, 480, { fit: "cover" }).jpeg({ quality: 82 }).toBuffer(),
    sharp(original).rotate().resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer(),
  ]);
  const { width, height } = await sharp(full).metadata();
  await Promise.all([save(`${id}-sq.jpg`, sq), save(`${id}-full.jpg`, full)]);

  // Uploaded here, from the bytes in hand, so tagging doesn't read them back.
  const uploaded = await deps.client.files.upload({ file: await toFile(full, `${id}.jpg`, { type: "image/jpeg" }) });
  const row = {
    id,
    date,
    takenAt: sentAt,
    filename: `telegram-${date}.jpg`,
    width: width ?? null,
    height: height ?? null,
    claudeFileId: uploaded.id,
  };
  await db
    .insert(photos)
    .values(row)
    .onConflictDoUpdate({ target: photos.id, set: { claudeFileId: uploaded.id } });
  // A new morning gets this photo as its day shot; an existing one keeps the owner's choice.
  await db.insert(days).values({ date, dayShotId: id }).onConflictDoNothing();
  const [day] = await db.select().from(days).where(eq(days.date, date)).limit(1);
  if (day && !day.dayShotId) await db.update(days).set({ dayShotId: id }).where(eq(days.date, date));

  const { tag, usage } = await tagPhoto(deps.client, getPhotoSource(), { id, claudeFileId: uploaded.id }, places);
  return { id, tag, usage };
}
