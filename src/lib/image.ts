/**
 * Photo URLs. Each photo has exactly two derivatives, downloaded once at
 * import time and served from local storage (see storage.ts / ingest.ts) —
 * there's no more live re-proxying to Google, so unlike the original
 * multi-density srcset this project shipped for the Android update, there's
 * only one file per mode to point at. `src`/`srcSet` are both returned so
 * existing call sites don't need to change shape.
 *
 * NOTE (documented gap): this also means the AVIF/WebP/Display P3 export
 * asked for in ANDROID_UPDATE.md §9 isn't happening here either — these are
 * plain JPEGs downloaded as-is from Google's derivative endpoint.
 */
export function buildSrcSet(id: string, mode: "sq" | "full"): { src: string; srcSet: string } {
  const src = `/api/photos/${id}/image?size=${mode}`;
  return { src, srcSet: `${src} 1x` };
}
