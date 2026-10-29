// Local preview data only — run with `npm run db:seed` against a local
// DATABASE_URL, then `DEMO_MODE=true npm run dev`. Cycles the 12 bundled
// sunrise photos across the last ~99 days the way the design prototype does,
// so every zoom/filter/stat has something real to show, and logs a walk for
// each of those mornings so the engine has history to learn from.
//
// `npm run db:seed -- --walks-only` redoes just the spots and walks, keeping
// the photos and the tags already paid for.
import "dotenv/config";
import { asc } from "drizzle-orm";
import { db } from "../src/db";
import { days, memoryFiles, ownerAccount, photos, recommendations, shareLinks, spots, syncLog, taggingBatches, walks } from "../src/db/schema";
import { addDays, localDayKey } from "../src/lib/dates";
import { env } from "../src/lib/env";

const PHOTO_COUNT = 12;
const HISTORY_DAYS = 165; // first-photo date is HISTORY_DAYS ago
const CAPTURE_RATE = 0.6; // ~99 captured days out of ~165 mornings tried
// Public landmarks, names only, so the place filter has something to show.
// Real places are location data and live only in the database.
const DEMO_PLACES = ["Telegraph Hill", "Crissy Field", "Treasure Island", "Rincon Park"];
const DEMO_SPOTS = [
  { name: "Telegraph Hill", kind: "vantage" as const },
  { name: "Treasure Island", kind: "vantage" as const },
  { name: "Crissy Field", kind: "waterfront" as const },
  { name: "Rincon Park", kind: "short_walk" as const, notes: "Ten minutes from the door" },
  { name: "Glen Canyon", kind: "forest" as const, notes: "Eucalyptus; drips in the fog" },
];
// Ratings cycle per spot, so the demo has a story: Telegraph Hill is the
// favourite, Rincon Park is the quick fallback.
const RATINGS: Record<string, number[]> = {
  "Telegraph Hill": [5, 4, 5, 5, 4],
  "Treasure Island": [4, 3, 4],
  "Crissy Field": [3, 4, 5, 3],
  "Rincon Park": [3, 2, 3],
};
const NOTES = ["pink for twenty minutes", "burned off by 7", "worth the climb", null, null, null];

function roll(seed: number): number {
  return Math.abs(Math.sin(seed * 12.9898) * 43758.5453) % 1;
}

/**
 * Spots, plus a walk for every morning with a photo (at the photo's place),
 * a few photo-less forest walks and some stayed-in mornings in between.
 */
async function seedWalks(today: string) {
  await db.delete(walks);
  await db.delete(spots);
  await db.delete(recommendations);
  await db.delete(memoryFiles);
  const spotRows = await db.insert(spots).values(DEMO_SPOTS).returning();
  const spotId = new Map(spotRows.map((s) => [s.name, s.id]));

  const photoRows = await db.select({ date: photos.date, place: photos.place }).from(photos).orderBy(asc(photos.date));
  const placeByDate = new Map(photoRows.map((p) => [p.date, p.place]));
  const visits = new Map<string, number>();
  let logged = 0;
  for (const [date, place] of placeByDate) {
    if (!place || !spotId.has(place)) continue;
    const n = visits.get(place) ?? 0;
    visits.set(place, n + 1);
    const ratings = RATINGS[place];
    await db.insert(walks).values({
      date,
      spotId: spotId.get(place)!,
      rating: ratings[n % ratings.length],
      note: NOTES[(n + place.length) % NOTES.length],
      source: "seed",
    });
    logged++;
  }

  // Mornings with no photo: some in bed, some in the forest.
  const first = photoRows[0]?.date;
  for (let offset = 1; first && addDays(today, -offset) >= first; offset++) {
    const date = addDays(today, -offset);
    if (placeByDate.has(date)) continue;
    const r = roll(offset + 7);
    if (r < 0.3) {
      await db.insert(walks).values({ date, stayedIn: true, rating: 4, note: "rain on the window, good book", source: "seed" });
      logged++;
    } else if (r < 0.42) {
      await db.insert(walks).values({ date, spotId: spotId.get("Glen Canyon")!, rating: 5, note: "tree rain", source: "seed" });
      logged++;
    }
  }
  return logged;
}

async function main() {
  if (process.argv.includes("--walks-only")) {
    const logged = await seedWalks(localDayKey(new Date(), env.timezone));
    console.log(`Seeded ${DEMO_SPOTS.length} spots and ${logged} mornings in the walk log.`);
    process.exit(0);
  }

  console.log("Seeding demo data…");

  await db.delete(taggingBatches);
  await db.delete(photos); // cascades to photo_tags
  await db.delete(days);
  await db.delete(syncLog);
  await db.delete(shareLinks);
  await db.delete(ownerAccount);

  const today = localDayKey(new Date(), env.timezone);
  let photoIndex = 0;
  let inserted = 0;

  for (let offset = HISTORY_DAYS; offset >= 0; offset--) {
    const dayKey = addDays(today, -offset);
    // Deterministic pseudo-randomness so re-seeding is stable.
    const roll = Math.abs(Math.sin(offset * 12.9898) * 43758.5453) % 1;
    if (roll > CAPTURE_RATE) continue;

    const filename = `${(photoIndex % PHOTO_COUNT) + 1}.jpg`;
    photoIndex++;
    // ~6am in APP_TIMEZONE (America/Los_Angeles default, UTC-7/-8) — offset
    // from UTC so formatTime() shows a plausible sunrise hour, not local UTC.
    const minute = (offset * 7) % 60;
    const takenAt = new Date(`${dayKey}T13:${String(minute).padStart(2, "0")}:00Z`);
    const id = `seed-${dayKey}-0`;

    await db.insert(photos).values({
      id,
      date: dayKey,
      takenAt,
      filename,
      width: 1360,
      height: 765,
      place: DEMO_PLACES[photoIndex % DEMO_PLACES.length],
    });
    await db.insert(days).values({ date: dayKey, dayShotId: id });

    // Give ~1 in 6 captured days a second shot, like the prototype's
    // multi-shot mornings.
    if (photoIndex % 6 === 0) {
      const secondId = `seed-${dayKey}-1`;
      const secondFilename = `${((photoIndex + 3) % PHOTO_COUNT) + 1}.jpg`;
      const secondTakenAt = new Date(takenAt.getTime() + 9 * 60_000);
      await db.insert(photos).values({
        id: secondId,
        date: dayKey,
        takenAt: secondTakenAt,
        filename: secondFilename,
        width: 1360,
        height: 765,
      });
    }
    inserted++;
  }

  await db.insert(ownerAccount).values({
    id: 1,
    email: "demo@example.com",
    googleSub: "demo",
    refreshTokenEncrypted: "unused-in-demo-mode",
    lastPickedAt: new Date(),
  });

  await db.insert(syncLog).values({
    status: "ok",
    finishedAt: new Date(),
    photosAdded: inserted,
  });

  await db.insert(shareLinks).values({ token: "demo123" });

  const logged = await seedWalks(today);
  console.log(`Seeded ${inserted} captured days ending ${today}, and ${logged} mornings in the walk log.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
