// Forecast + solar-position source for the planning view (see
// design_handoff_sunrise_calendar/PLANNING.md §Data). Open-Meteo needs no
// API key and covers the weather side; civil twilight and the 6°-altitude
// golden-hour end are exact solar-position maths (suncalc), not an API call.

import * as SunCalc from "suncalc";
import { addDays, dayKeyToDate } from "./dates";

export interface RawDayForecast {
  date: string;
  sunrise: Date;
  civilTwilightBegin: Date;
  goldenHourEnd: Date;
  cloudTotal: number;
  cloudLow: number;
  cloudMid: number;
  cloudHigh: number;
  tempAtSunrise: number;
  apparentTemp: number;
  windSpeed: number;
  windDir: number;
  precipProbability: number;
  fogProbability: number;
  ceilingFt: number | null;
}

interface OpenMeteoHourly {
  time: string[];
  cloudcover: number[];
  cloudcover_low: number[];
  cloudcover_mid: number[];
  cloudcover_high: number[];
  temperature_2m: number[];
  apparent_temperature: number[];
  dewpoint_2m: number[];
  windspeed_10m: number[];
  winddirection_10m: number[];
  precipitation_probability: number[];
  visibility: number[];
}

const HOURLY_VARS = [
  "cloudcover",
  "cloudcover_low",
  "cloudcover_mid",
  "cloudcover_high",
  "temperature_2m",
  "apparent_temperature",
  "dewpoint_2m",
  "windspeed_10m",
  "winddirection_10m",
  "precipitation_probability",
  "visibility",
].join(",");

async function fetchHourly(lat: number, lon: number, forecastDays: number): Promise<OpenMeteoHourly> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("hourly", HOURLY_VARS);
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("windspeed_unit", "mph");
  // Requested in UTC (rather than the owner's local timezone) purely so the
  // returned timestamps are unambiguous to parse — we only ever use them to
  // find the hour nearest a specific UTC instant (that day's sunrise), so
  // the civil day Open-Meteo thinks "today" is doesn't matter as long as
  // the buffer below covers it.
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set("forecast_days", String(forecastDays));
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Open-Meteo request failed: ${res.status}`);
  const data = await res.json();
  return data.hourly as OpenMeteoHourly;
}

function nearestHourIndex(utcTimes: Date[], target: Date): number {
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < utcTimes.length; i++) {
    const diff = Math.abs(utcTimes[i].getTime() - target.getTime());
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

function fogProbabilityFromVisibility(visibilityMeters: number): number {
  if (visibilityMeters <= 400) return 95;
  if (visibilityMeters >= 10_000) return 0;
  return Math.round(100 * (1 - (visibilityMeters - 400) / 9600));
}

/** Rule-of-thumb cloud-base height from the surface dew-point spread — only meaningful when there's actually a low stratus deck to measure. */
function ceilingFromDewpointSpread(tempF: number, dewpointF: number, cloudLow: number): number | null {
  if (cloudLow < 50) return null;
  return Math.max(0, Math.round(125 * (tempF - dewpointF)));
}

/**
 * `days` consecutive days of forecast starting at `startDate` (a civil day
 * key). Solar times are computed directly from lat/lon; everything else is
 * sampled from the Open-Meteo hourly array at the hour nearest that day's
 * sunrise, per PLANNING.md's "sample the hour containing sunrise".
 */
export async function fetchForecastDays(
  lat: number,
  lon: number,
  startDate: string,
  days: number,
): Promise<RawDayForecast[]> {
  // Buffer past `days` so the UTC-anchored request window still covers
  // every owner-local morning in range regardless of UTC offset.
  const hourly = await fetchHourly(lat, lon, days + 3);
  const hourlyTimes = hourly.time.map((t) => new Date(`${t}:00Z`));

  const out: RawDayForecast[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(startDate, i);
    const solar = SunCalc.getTimes(dayKeyToDate(date), lat, lon);
    // solarNoon is the one SunTimes field that's never null — a safe stand-in
    // for the rare (near-polar) owner location/date where dawn/sunrise/
    // goldenHourEnd genuinely don't occur.
    const sunrise = solar.sunrise ?? solar.solarNoon;
    const idx = nearestHourIndex(hourlyTimes, sunrise);

    out.push({
      date,
      sunrise,
      civilTwilightBegin: solar.dawn ?? solar.solarNoon,
      goldenHourEnd: solar.goldenHourEnd ?? solar.solarNoon,
      cloudTotal: hourly.cloudcover[idx],
      cloudLow: hourly.cloudcover_low[idx],
      cloudMid: hourly.cloudcover_mid[idx],
      cloudHigh: hourly.cloudcover_high[idx],
      tempAtSunrise: hourly.temperature_2m[idx],
      apparentTemp: hourly.apparent_temperature[idx],
      windSpeed: hourly.windspeed_10m[idx],
      windDir: hourly.winddirection_10m[idx],
      precipProbability: hourly.precipitation_probability[idx],
      fogProbability: fogProbabilityFromVisibility(hourly.visibility[idx]),
      ceilingFt: ceilingFromDewpointSpread(
        hourly.temperature_2m[idx],
        hourly.dewpoint_2m[idx],
        hourly.cloudcover_low[idx],
      ),
    });
  }
  return out;
}
