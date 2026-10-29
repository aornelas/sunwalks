// Keeps what the forecast said about each morning before forecast_days
// overwrites it, so the forecast can later be compared with the sky each
// photo actually shows (photo_tags.observedCategory). See the
// forecast_snapshots table for what leadDays and source mean.

import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { forecastSnapshots } from "@/db/schema";
import { addDays, dayKeyToDate, localDayKey } from "./dates";
import { env } from "./env";
import { deriveVerdict } from "./verdict";
import { fetchHistoricalForecastDays, type RawDayForecast } from "./weather";

/** Open-Meteo's Historical Forecast archive starts around here. */
export const HISTORICAL_FORECAST_START = "2022-01-01";
/** Days per archive request; keeps each response small. */
const CHUNK_DAYS = 90;

function snapshotRow(d: RawDayForecast, leadDays: number, source: "live" | "historical", issuedAt: Date) {
  return {
    date: d.date,
    leadDays,
    source,
    issuedAt,
    cloudTotal: d.cloudTotal,
    cloudLow: d.cloudLow,
    cloudMid: d.cloudMid,
    cloudHigh: d.cloudHigh,
    tempAtSunrise: d.tempAtSunrise,
    windSpeed: d.windSpeed,
    precipProbability: d.precipProbability,
    fogProbability: d.fogProbability,
    ceilingFt: d.ceilingFt,
    verdict: deriveVerdict(d).word,
  };
}

function daysBetween(from: string, to: string): number {
  return Math.round((dayKeyToDate(to).getTime() - dayKeyToDate(from).getTime()) / 86_400_000);
}

/**
 * Records a live fetch. A later fetch on the same owner-local day replaces
 * the row for that (date, lead) pair, so the lead-1 row ends up holding the
 * last forecast issued the day before: the evening-before prediction.
 */
export async function recordLiveSnapshots(raw: RawDayForecast[], issuedAt: Date): Promise<void> {
  const issuedDay = localDayKey(issuedAt, env.timezone);
  for (const d of raw) {
    const leadDays = daysBetween(issuedDay, d.date);
    if (leadDays < 0) continue;
    const row = snapshotRow(d, leadDays, "live", issuedAt);
    await db
      .insert(forecastSnapshots)
      .values(row)
      .onConflictDoUpdate({
        target: [forecastSnapshots.date, forecastSnapshots.leadDays, forecastSnapshots.source],
        set: row,
      });
  }
}

/** Splits sorted day keys into runs of consecutive days, each at most CHUNK_DAYS long. */
function contiguousChunks(dates: string[]): { start: string; end: string }[] {
  const chunks: { start: string; end: string }[] = [];
  for (const date of dates) {
    const last = chunks.at(-1);
    if (last && addDays(last.end, 1) === date && daysBetween(last.start, date) < CHUNK_DAYS) last.end = date;
    else chunks.push({ start: date, end: date });
  }
  return chunks;
}

/**
 * Fills in historical snapshots for every morning in range that doesn't
 * have one yet. Existing rows are never touched, so re-running over the
 * same range writes nothing, and makes no requests unless the archive had
 * a gap (those mornings are asked for again, in case it has since filled).
 */
export async function backfillHistoricalSnapshots(
  startDate: string,
  endDate: string,
  log: (message: string) => void = () => {},
): Promise<{ requested: number; inserted: number; unavailable: number }> {
  const start = startDate < HISTORICAL_FORECAST_START ? HISTORICAL_FORECAST_START : startDate;
  if (start > endDate) return { requested: 0, inserted: 0, unavailable: 0 };

  const existing = await db
    .select({ date: forecastSnapshots.date })
    .from(forecastSnapshots)
    .where(
      and(
        eq(forecastSnapshots.source, "historical"),
        gte(forecastSnapshots.date, start),
        lte(forecastSnapshots.date, endDate),
      ),
    );
  const have = new Set(existing.map((r) => r.date));
  const missing: string[] = [];
  for (let d = start; d <= endDate; d = addDays(d, 1)) if (!have.has(d)) missing.push(d);

  let inserted = 0;
  for (const chunk of contiguousChunks(missing)) {
    log(`  ${chunk.start} to ${chunk.end}`);
    const raw = await fetchHistoricalForecastDays(env.ownerLat, env.ownerLon, chunk.start, chunk.end);
    if (raw.length === 0) continue;
    // The archive doesn't say when each run was issued; sunrise itself is
    // the honest upper bound for a lead-0 forecast.
    const rows = raw.map((d) => snapshotRow(d, 0, "historical", d.sunrise));
    const result = await db.insert(forecastSnapshots).values(rows).onConflictDoNothing().returning({ id: forecastSnapshots.id });
    inserted += result.length;
  }
  return { requested: missing.length, inserted, unavailable: missing.length - inserted };
}
