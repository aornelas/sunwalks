import { db } from "@/db";
import { days } from "@/db/schema";
import { addDays, todayDayKey } from "./dates";
import { env } from "./env";
import type { Stats } from "./types";

export async function computeStats(): Promise<Stats> {
  const rows = await db.select({ date: days.date }).from(days);
  const dateSet = new Set(rows.map((r) => r.date));
  const total = dateSet.size;

  if (total === 0) {
    return { total: 0, last7: 0, last30: 0, avgPerWeek: 0, currentRun: 0 };
  }

  const today = todayDayKey(env.timezone);
  const cutoff7 = addDays(today, -6);
  const cutoff30 = addDays(today, -29);

  let last7 = 0;
  let last30 = 0;
  for (const date of dateSet) {
    if (date >= cutoff7 && date <= today) last7++;
    if (date >= cutoff30 && date <= today) last30++;
  }

  const firstDate = [...dateSet].sort()[0];
  const daysSinceFirst = Math.max(
    1,
    Math.round((Date.parse(today) - Date.parse(firstDate)) / (1000 * 60 * 60 * 24)) + 1,
  );
  const weeksSinceFirst = Math.max(daysSinceFirst / 7, 1);
  const avgPerWeek = Math.round((total / weeksSinceFirst) * 10) / 10;

  let currentRun = 0;
  let cursor = dateSet.has(today) ? today : addDays(today, -1);
  while (dateSet.has(cursor)) {
    currentRun++;
    cursor = addDays(cursor, -1);
  }

  return { total, last7, last30, avgPerWeek, currentRun };
}
