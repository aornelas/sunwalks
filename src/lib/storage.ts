import { mkdir, readFile, writeFile, unlink } from "fs/promises";
import path from "path";

/**
 * Local-filesystem photo storage. The Picker API replaced the old Library
 * API's "proxy Google's baseUrl on every request" model — a picked item's
 * baseUrl expires in ~60 minutes and there is no way to refresh it once the
 * picker session is gone (see ANDROID_UPDATE.md discussion / ingest.ts) — so
 * derivatives are downloaded once, at import time, and served from here
 * afterward.
 *
 * DEPLOYMENT NOTE: this writes to the local disk, which works for local dev
 * and any traditionally-hosted Node server, but NOT for Vercel's serverless
 * functions (ephemeral, read-only filesystem outside /tmp). Before deploying
 * there, swap this module for Vercel Blob (`@vercel/blob`) or S3/R2 — same
 * two functions, different backend.
 */

const STORAGE_DIR = path.join(process.cwd(), ".photo-storage");

function keyToPath(key: string): string {
  // Keys are always `${mediaItemId}-${sq|full}.jpg`, but guard against path
  // traversal regardless since the id ultimately traces back to Google.
  const safe = key.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(STORAGE_DIR, safe);
}

export async function saveImage(key: string, bytes: Buffer): Promise<void> {
  await mkdir(STORAGE_DIR, { recursive: true });
  await writeFile(keyToPath(key), bytes);
}

export async function readImage(key: string): Promise<Buffer | null> {
  try {
    return await readFile(keyToPath(key));
  } catch {
    return null;
  }
}

export async function deleteImage(key: string): Promise<void> {
  await unlink(keyToPath(key)).catch(() => {});
}
