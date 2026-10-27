// Builds the demo-mode sample photos from a folder of source images, with all
// metadata (EXIF, GPS, XMP, IPTC, ICC) stripped, and audits committed images
// for metadata that shouldn't be published.
//
//   npm run sample-photos -- <source-dir>   write public/seed-photos/{full,sq}/N.jpg
//   npm run sample-photos -- --check        fail if any committed image has metadata
//
// Sources are taken in natural filename order and numbered 1..N. They should
// be 16:9 with the subject near the centre: the square derivative and the
// week view's tall card are centre crops. scripts/seed.ts cycles through
// PHOTO_COUNT of them and records FULL's dimensions on each seeded photo.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const OUT_DIR = "public/seed-photos";
const FULL = { width: 1360, height: 765 }; // keep in sync with scripts/seed.ts
const SQ = { width: 480, height: 480 }; // matches the real ingest's =w480-h480-c
const SOURCE_EXT = /\.(jpe?g|png|webp|heic|heif|tiff?)$/i;
const AUDIT_EXT = /\.(jpe?g|png|webp|gif|tiff?)$/i;

async function build(sourceDir: string) {
  const files = readdirSync(sourceDir)
    .filter((f) => SOURCE_EXT.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (files.length === 0) throw new Error(`No images found in ${sourceDir}`);

  for (const size of ["full", "sq"]) mkdirSync(path.join(OUT_DIR, size), { recursive: true });

  for (const [i, file] of files.entries()) {
    const n = i + 1;
    // rotate() bakes in the EXIF orientation before it's dropped; sharp
    // writes no metadata unless asked to (no withMetadata/keepExif here).
    const source = sharp(path.join(sourceDir, file)).rotate();
    for (const [size, dims] of [["full", FULL], ["sq", SQ]] as const) {
      const out = path.join(OUT_DIR, size, `${n}.jpg`);
      await source
        .clone()
        .resize({ ...dims, fit: "cover", position: "centre" })
        .jpeg({ quality: 82, mozjpeg: true })
        .toFile(out);
    }
    console.log(`${file} -> ${n}.jpg`);
  }
  console.log(`Wrote ${files.length} photos to ${OUT_DIR}/.`);
  if (files.length !== 12) {
    console.warn(`Note: scripts/seed.ts expects PHOTO_COUNT = 12; update it to ${files.length}.`);
  }
}

async function check() {
  const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter((f) => AUDIT_EXT.test(f));
  const flagged: string[] = [];
  for (const file of tracked) {
    const meta = await sharp(readFileSync(file)).metadata();
    const found = (["exif", "xmp", "iptc"] as const).filter((k) => meta[k]);
    if (found.length) flagged.push(`${file}: ${found.join(", ")}`);
  }
  if (flagged.length) {
    console.error(`Images with metadata:\n  ${flagged.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`${tracked.length} committed images checked: no EXIF, XMP or IPTC.`);
}

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: npm run sample-photos -- <source-dir> | --check");
  process.exit(1);
}
(arg === "--check" ? check() : build(arg)).catch((err) => {
  console.error(err);
  process.exit(1);
});
