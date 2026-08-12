// Local preview data only — run with `npm run db:seed` against a local
// DATABASE_URL, then `DEMO_MODE=true npm run dev`. Cycles the 12 bundled
// sunrise photos across the last ~99 days the way the design prototype does,
// so every zoom/filter/stat has something real to show.
import "dotenv/config";
import { db } from "../src/db";
import { days, ownerAccount, photos, shareLinks, syncLog } from "../src/db/schema";
import { addDays, localDayKey } from "../src/lib/dates";
import { env } from "../src/lib/env";

const PHOTO_COUNT = 12;
const HISTORY_DAYS = 220; // first-photo date is HISTORY_DAYS ago
const CAPTURE_RATE = 0.6; // ~99 captured days out of ~165 mornings tried

async function main() {
  console.log("Seeding demo data…");

  await db.delete(photos);
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

    const filename = `${(photoIndex % PHOTO_COUNT) + 1}.png`;
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
      width: 1600,
      height: 900,
    });
    await db.insert(days).values({ date: dayKey, dayShotId: id });

    // Give ~1 in 6 captured days a second shot, like the prototype's
    // multi-shot mornings.
    if (photoIndex % 6 === 0) {
      const secondId = `seed-${dayKey}-1`;
      const secondFilename = `${((photoIndex + 3) % PHOTO_COUNT) + 1}.png`;
      const secondTakenAt = new Date(takenAt.getTime() + 9 * 60_000);
      await db.insert(photos).values({
        id: secondId,
        date: dayKey,
        takenAt: secondTakenAt,
        filename: secondFilename,
        width: 1600,
        height: 900,
      });
    }
    inserted++;
  }

  await db.insert(ownerAccount).values({
    id: 1,
    email: "demo@example.com",
    googleSub: "demo",
    refreshTokenEncrypted: "unused-in-demo-mode",
    albumId: "demo-album",
    albumName: "Sunrises",
    autoSync: true,
  });

  await db.insert(syncLog).values({
    status: "ok",
    finishedAt: new Date(),
    photosAdded: inserted,
  });

  await db.insert(shareLinks).values({ token: "demo123" });

  console.log(`Seeded ${inserted} captured days ending ${today}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
