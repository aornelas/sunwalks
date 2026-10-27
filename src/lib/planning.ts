// Server-side orchestration for the planning view: DB-backed forecast
// cache, refresh cadence, and the "which day is the default target" rule.
// See design_handoff_sunrise_calendar/PLANNING.md §Data and §Behaviour.

import * as SunCalc from "suncalc";
import { and, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { forecastDays } from "@/db/schema";
import { addDays, dayKeyToDate, todayDayKey } from "./dates";
import { env } from "./env";
import { fetchForecastDays, type RawDayForecast } from "./weather";
import { deriveVerdict, buildReason } from "./verdict";
import { computeTimelineWindow } from "./timeline";
import type { PlanningDay, PlanningResponse } from "./types";

const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // refresh cadence: 3 hours, per PLANNING.md
const WINDOW_DAYS = 7;

/**
 * Tomorrow, unless it's after midnight but still before this morning's
 * golden-hour end — then today counts as "this morning" and is the target.
 */
export function planningStartDate(now: Date = new Date()): string {
  const today = todayDayKey(env.timezone);
  const todaysGoldenHourEnd = SunCalc.getTimes(dayKeyToDate(today), env.ownerLat, env.ownerLon).goldenHourEnd;
  if (!todaysGoldenHourEnd) return addDays(today, 1); // no golden hour today (near-polar) — nothing left to target
  return now < todaysGoldenHourEnd ? today : addDays(today, 1);
}

type ForecastRow = typeof forecastDays.$inferSelect;

// The verdict is re-derived from the stored inputs rather than read back,
// so a change to the rules or the vocabulary applies to cached rows at once
// instead of after the next refresh (and the stale-forecast fallback never
// serves a word the client no longer knows).
function toPlanningDay(row: ForecastRow): PlanningDay {
  const { word, score } = deriveVerdict(row);
  return {
    date: row.date,
    sunrise: row.sunrise.toISOString(),
    civilTwilightBegin: row.civilTwilightBegin.toISOString(),
    goldenHourEnd: row.goldenHourEnd.toISOString(),
    cloudTotal: row.cloudTotal,
    cloudLow: row.cloudLow,
    cloudMid: row.cloudMid,
    cloudHigh: row.cloudHigh,
    tempAtSunrise: row.tempAtSunrise,
    apparentTemp: row.apparentTemp,
    windSpeed: row.windSpeed,
    windDir: row.windDir,
    precipProbability: row.precipProbability,
    fogProbability: row.fogProbability,
    ceilingFt: row.ceilingFt,
    verdict: word,
    score,
    reason: buildReason(word, row),
  };
}

async function upsertForecast(raw: RawDayForecast[], fetchedAt: Date): Promise<void> {
  for (const d of raw) {
    const { word, score } = deriveVerdict(d);
    const row = {
      date: d.date,
      sunrise: d.sunrise,
      civilTwilightBegin: d.civilTwilightBegin,
      goldenHourEnd: d.goldenHourEnd,
      cloudTotal: d.cloudTotal,
      cloudLow: d.cloudLow,
      cloudMid: d.cloudMid,
      cloudHigh: d.cloudHigh,
      tempAtSunrise: d.tempAtSunrise,
      apparentTemp: d.apparentTemp,
      windSpeed: d.windSpeed,
      windDir: d.windDir,
      precipProbability: d.precipProbability,
      fogProbability: d.fogProbability,
      ceilingFt: d.ceilingFt,
      verdict: word,
      score,
      reason: buildReason(word, d),
      fetchedAt,
    };
    await db.insert(forecastDays).values(row).onConflictDoUpdate({ target: forecastDays.date, set: row });
  }
}

async function readCached(startDate: string, endDate: string): Promise<ForecastRow[]> {
  return db
    .select()
    .from(forecastDays)
    .where(and(gte(forecastDays.date, startDate), lte(forecastDays.date, endDate)))
    .orderBy(forecastDays.date);
}

interface PlanningResult {
  days: PlanningDay[];
  fetchedAt: string | null;
  stale: boolean;
  error?: string;
}

async function getPlanningDays(startDate: string, count = WINDOW_DAYS): Promise<PlanningResult> {
  const endDate = addDays(startDate, count - 1);
  const cached = await readCached(startDate, endDate);
  const oldestFetch = cached.length > 0 ? Math.min(...cached.map((r) => r.fetchedAt.getTime())) : 0;
  const fresh = cached.length === count && Date.now() - oldestFetch < CACHE_TTL_MS;

  if (fresh) {
    return { days: cached.map(toPlanningDay), fetchedAt: new Date(oldestFetch).toISOString(), stale: false };
  }

  try {
    const raw = await fetchForecastDays(env.ownerLat, env.ownerLon, startDate, count);
    const fetchedAt = new Date();
    await upsertForecast(raw, fetchedAt);
    const refreshed = await readCached(startDate, endDate);
    return { days: refreshed.map(toPlanningDay), fetchedAt: fetchedAt.toISOString(), stale: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forecast unavailable";
    if (cached.length > 0) {
      // Keep the last forecast and say so, rather than blocking the calendar.
      return { days: cached.map(toPlanningDay), fetchedAt: new Date(oldestFetch).toISOString(), stale: true, error: message };
    }
    return { days: [], fetchedAt: null, stale: true, error: message };
  }
}

/** Full response shape the API route and the initial server render both need. */
export async function getPlanningResponse(startDate?: string): Promise<PlanningResponse> {
  const start = startDate ?? planningStartDate();
  const result = await getPlanningDays(start);

  const anchor = result.days[Math.min(3, result.days.length - 1)];
  const window = anchor
    ? computeTimelineWindow(new Date(anchor.sunrise), env.timezone)
    : { startMinutes: 330, endMinutes: 450 }; // 5:30–7:30, the spec's default

  return {
    days: result.days,
    windowStartMinutes: window.startMinutes,
    windowEndMinutes: window.endMinutes,
    fetchedAt: result.fetchedAt,
    stale: result.stale,
    error: result.error,
  };
}
