import { del, get, put } from "@vercel/blob";

/**
 * Vercel Blob-backed photo storage. The Picker API replaced the old Library
 * API's "proxy Google's baseUrl on every request" model — a picked item's
 * baseUrl expires in ~60 minutes and there is no way to refresh it once the
 * picker session is gone (see ANDROID_UPDATE.md discussion / ingest.ts) — so
 * derivatives are downloaded once, at import time, and served from here
 * afterward.
 *
 * The store is private: only the app's own image route (and whoever holds
 * BLOB_READ_WRITE_TOKEN) can read these, matching how local disk was never
 * publicly exposed either. `get`/`del` below take the deterministic pathname
 * directly (no need to persist the blob URL anywhere) since Vercel Blob
 * resolves it from the store's read/write token.
 */

const ACCESS = "private" as const;

function keyToPathname(key: string): string {
  // Keys are always `${mediaItemId}-${sq|full}.jpg`, but guard against path
  // traversal regardless since the id ultimately traces back to Google.
  const safe = key.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `photos/${safe}`;
}

export async function saveImage(key: string, bytes: Buffer): Promise<void> {
  await put(keyToPathname(key), bytes, {
    access: ACCESS,
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "image/jpeg",
  });
}

export async function readImage(key: string): Promise<Buffer | null> {
  try {
    const result = await get(keyToPathname(key), { access: ACCESS });
    if (!result || result.statusCode !== 200) return null;
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  } catch {
    return null;
  }
}

export async function deleteImage(key: string): Promise<void> {
  await del(keyToPathname(key)).catch(() => {});
}
