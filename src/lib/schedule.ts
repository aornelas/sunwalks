// The owner's mornings: when they need to be home and how long they like to
// stay out, as rules in schedule_rules. A rule with dates (summer break, a
// school holiday) beats the weekly pattern on those days, and among rules
// of the same sort the newest wins, so "no school Friday" just adds a rule.

import { desc, eq } from "drizzle-orm";
import * as SunCalc from "suncalc";
import { db } from "@/db";
import { scheduleRules } from "@/db/schema";
import { weekdayIndex, zonedTimeToInstant } from "./dates";
import { env } from "./env";
import type { DayRule } from "./reach";

export type ScheduleRule = typeof scheduleRules.$inferSelect;

/** With no rules at all: no time to be back, a quarter of an hour out. */
export const DEFAULT_RULE: DayRule = { label: "no schedule set", backBy: null, stayMinutes: 15 };

export function ruleForDate(rules: ScheduleRule[], date: string): DayRule {
  const weekday = weekdayIndex(date);
  const applies = rules.filter(
    (r) =>
      r.weekdays.includes(weekday) &&
      (r.startDate == null || r.startDate <= date) &&
      (r.endDate == null || date <= r.endDate),
  );
  const newestFirst = (a: ScheduleRule, b: ScheduleRule) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id;
  const dated = applies.filter((r) => r.startDate != null || r.endDate != null).sort(newestFirst);
  const weekly = applies.filter((r) => r.startDate == null && r.endDate == null).sort(newestFirst);
  const rule = dated[0] ?? weekly[0];
  return rule ? { label: rule.label, backBy: rule.backBy, stayMinutes: rule.stayMinutes } : DEFAULT_RULE;
}

export async function listRules(): Promise<ScheduleRule[]> {
  return db.select().from(scheduleRules).orderBy(desc(scheduleRules.createdAt));
}

export interface NewRule {
  label: string;
  weekdays: number[];
  startDate?: string | null;
  endDate?: string | null;
  backBy?: string | null;
  stayMinutes: number;
}

export async function addRule(rule: NewRule): Promise<ScheduleRule> {
  if (!rule.label.trim()) throw new Error("A rule needs a label");
  if (rule.weekdays.length === 0 || rule.weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    throw new Error("Weekdays are 0 (Sunday) to 6 (Saturday)");
  }
  if (rule.backBy != null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(rule.backBy)) throw new Error("backBy is HH:MM, 24-hour");
  for (const d of [rule.startDate, rule.endDate]) {
    if (d != null && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error("Dates are YYYY-MM-DD");
  }
  if (rule.startDate && rule.endDate && rule.endDate < rule.startDate) throw new Error("The end date is before the start");
  if (!Number.isInteger(rule.stayMinutes) || rule.stayMinutes < 0 || rule.stayMinutes > 240) {
    throw new Error("Stay is 0 to 240 minutes");
  }
  const [row] = await db
    .insert(scheduleRules)
    .values({
      label: rule.label.trim(),
      weekdays: [...new Set(rule.weekdays)].sort(),
      startDate: rule.startDate ?? null,
      endDate: rule.endDate ?? rule.startDate ?? null,
      backBy: rule.backBy ?? null,
      stayMinutes: rule.stayMinutes,
    })
    .returning();
  return row;
}

export async function removeRule(id: number): Promise<boolean> {
  return (await db.delete(scheduleRules).where(eq(scheduleRules.id, id)).returning()).length > 0;
}

/** Sunrise at the owner's home on a day key. */
export function sunriseOn(date: string): Date {
  // Local noon, so the solar day can't slip to a neighbouring date.
  const { sunrise } = SunCalc.getTimes(zonedTimeToInstant(date, "12:00", env.timezone), env.ownerLat, env.ownerLon);
  if (!sunrise) throw new Error(`No sunrise on ${date}`);
  return sunrise;
}

/** The rule for a morning, and the instant its backBy falls on. */
export async function morningSchedule(date: string): Promise<{ rule: DayRule; backBy: Date | null; sunrise: Date }> {
  const rule = ruleForDate(await listRules(), date);
  return {
    rule,
    backBy: rule.backBy ? zonedTimeToInstant(date, rule.backBy, env.timezone) : null,
    sunrise: sunriseOn(date),
  };
}
