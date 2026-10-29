// Rebuilds what the forecast said about each past morning from Open-Meteo's
// Historical Forecast API, so calibration can start with the whole photo
// archive instead of waiting for new evenings to accumulate. Defaults to
// the earliest photo through yesterday; `--start` and `--end` (day keys)
// override either end.
//
// Safe to re-run: mornings that already have a historical snapshot are
// skipped, so a second run over the same range writes nothing.
import "dotenv/config";
import { asc } from "drizzle-orm";
import { db } from "../src/db";
import { photos } from "../src/db/schema";
import { addDays, todayDayKey } from "../src/lib/dates";
import { env } from "../src/lib/env";
import { backfillHistoricalSnapshots } from "../src/lib/forecast-snapshots";

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const [first] = await db.select({ date: photos.date }).from(photos).orderBy(asc(photos.date)).limit(1);
  const start = argValue("--start") ?? first?.date;
  const end = argValue("--end") ?? addDays(todayDayKey(env.timezone), -1);
  if (!start) {
    console.log("No photos yet, so nothing to backfill. Pass --start to backfill a range anyway.");
    process.exit(0);
  }

  console.log(`Backfilling historical forecasts for ${start} to ${end}…`);
  const { requested, inserted, unavailable } = await backfillHistoricalSnapshots(start, end, console.log);
  if (requested === 0) console.log("Nothing to backfill: every morning in range already has a snapshot.");
  else console.log(`Stored ${inserted} mornings; ${unavailable} had no archived forecast.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
