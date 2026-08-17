import { db } from "@/db";
import { days } from "@/db/schema";
import { addDays, monthKey, startOfWeek, todayDayKey } from "./dates";
import { env } from "./env";
import type { Stats } from "./types";

export async function computeStats(): Promise<Stats> {
  const rows = await db.select({ date: days.date }).from(days);
  const dateSet = new Set(rows.map((r) => r.date));
  const total = dateSet.size;

  if (total === 0) {
    return { total: 0, thisWeek: 0, bestWeek: 0, thisMonth: 0, bestMonth: 0, thisYear: 0, bestYear: 0, currentRun: 0 };
  }

  const today = todayDayKey(env.timezone);

  const weekCounts = new Map<string, number>();
  const monthCounts = new Map<string, number>();
  const yearCounts = new Map<string, number>();
  for (const date of dateSet) {
    const wk = startOfWeek(date);
    weekCounts.set(wk, (weekCounts.get(wk) ?? 0) + 1);
    const mk = monthKey(date);
    monthCounts.set(mk, (monthCounts.get(mk) ?? 0) + 1);
    const yk = date.slice(0, 4);
    yearCounts.set(yk, (yearCounts.get(yk) ?? 0) + 1);
  }

  const thisWeek = weekCounts.get(startOfWeek(today)) ?? 0;
  const bestWeek = Math.max(...weekCounts.values());
  const thisMonth = monthCounts.get(monthKey(today)) ?? 0;
  const bestMonth = Math.max(...monthCounts.values());
  const thisYear = yearCounts.get(today.slice(0, 4)) ?? 0;
  const bestYear = Math.max(...yearCounts.values());

  let currentRun = 0;
  let cursor = dateSet.has(today) ? today : addDays(today, -1);
  while (dateSet.has(cursor)) {
    currentRun++;
    cursor = addDays(cursor, -1);
  }

  return { total, thisWeek, bestWeek, thisMonth, bestMonth, thisYear, bestYear, currentRun };
}
