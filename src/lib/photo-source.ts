import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { photos } from "@/db/schema";
import { env } from "./env";
import { readImage } from "./storage";

/**
 * The seam between the app and wherever sunrise photos actually live.
 * Today that's photos imported from Google Photos (rows in `photos`, bytes
 * in Vercel Blob); the native Android app will read them straight off the
 * device instead, and only needs to implement this interface.
 *
 * Place is the one piece of metadata the app writes back. Google Photos
 * gives no location (the Picker API's metadata has no GPS), so it comes from
 * the owner, or from a Claude suggestion the owner confirms. Real places are
 * location data: they live only in the database, never in committed files,
 * and the share link never sees them (see lib/data.ts).
 */

export type PhotoSize = "sq" | "full";

export interface SourcePhoto {
  id: string;
  /** Owner-local civil day key. */
  date: string;
  takenAt: Date;
  filename: string;
  width: number | null;
  height: number | null;
  place: string | null;
}

export interface PhotoMetadata {
  place: string | null;
}

export interface PhotoSource {
  /** Oldest first; `range` bounds are inclusive day keys. */
  listPhotos(range?: { start: string; end: string }): Promise<SourcePhoto[]>;
  getPhoto(id: string): Promise<SourcePhoto | null>;
  /** JPEG bytes of one derivative, or null if it isn't stored. */
  getImage(id: string, size: PhotoSize): Promise<Buffer | null>;
  getMetadata(id: string): Promise<PhotoMetadata | null>;
  setMetadata(id: string, patch: Partial<PhotoMetadata>): Promise<void>;
}

/** Trims and collapses whitespace so "Telegraph  Hill " and "Telegraph Hill" are one spot; blank means "no place". */
export function normalizePlace(place: string | null | undefined): string | null {
  const trimmed = place?.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed : null;
}

type PhotoRow = typeof photos.$inferSelect;

function toSourcePhoto(row: PhotoRow): SourcePhoto {
  return {
    id: row.id,
    date: row.date,
    takenAt: row.takenAt,
    filename: row.filename,
    width: row.width,
    height: row.height,
    place: row.place,
  };
}

/** Photos imported into the database, with bytes read by `readBytes`. */
function databasePhotoSource(readBytes: (row: PhotoRow, size: PhotoSize) => Promise<Buffer | null>): PhotoSource {
  async function findRow(id: string): Promise<PhotoRow | undefined> {
    const [row] = await db.select().from(photos).where(eq(photos.id, id)).limit(1);
    return row;
  }

  return {
    async listPhotos(range) {
      const rows = await db
        .select()
        .from(photos)
        .where(range ? and(gte(photos.date, range.start), lte(photos.date, range.end)) : undefined)
        .orderBy(asc(photos.takenAt));
      return rows.map(toSourcePhoto);
    },
    async getPhoto(id) {
      const row = await findRow(id);
      return row ? toSourcePhoto(row) : null;
    },
    async getImage(id, size) {
      const row = await findRow(id);
      return row ? readBytes(row, size) : null;
    },
    async getMetadata(id) {
      const row = await findRow(id);
      return row ? { place: row.place } : null;
    },
    async setMetadata(id, patch) {
      if (!("place" in patch)) return;
      await db
        .update(photos)
        .set({ place: normalizePlace(patch.place) })
        .where(eq(photos.id, id));
    },
  };
}

/** Google Photos imports: derivatives were downloaded once at import time (see ingest.ts). */
const importedPhotoSource = databasePhotoSource((row, size) => readImage(`${row.id}-${size}.jpg`));

/** Bytes of a bundled sample photo, or null if there's no such file. */
export async function readSamplePhoto(filename: string, size: PhotoSize): Promise<Buffer | null> {
  // basename() keeps a stored filename from reaching outside the folder.
  const file = path.join(process.cwd(), "public", "seed-photos", size, path.basename(filename));
  return readFile(file).catch(() => null);
}

/** Demo mode: seeded rows whose bytes are the bundled sample photos in public/seed-photos/. */
const demoPhotoSource = databasePhotoSource((row, size) => readSamplePhoto(row.filename, size));

export function getPhotoSource(): PhotoSource {
  return env.demoMode ? demoPhotoSource : importedPhotoSource;
}
