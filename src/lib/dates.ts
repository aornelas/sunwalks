// Dates are handled as two distinct things:
// - a "day key" (YYYY-MM-DD): a civil date already resolved to the owner's
//   local timezone at ingest time. All calendar arithmetic below treats it
//   as a plain calendar date (parsed at UTC midnight) — no further timezone
//   math is needed once a photo has been assigned a day key.
// - real Date/timestamp values (e.g. `takenAt`), which do need a timezone
//   when formatted for display (the capture time-of-day, e.g. "6:24 AM").

export function localDayKey(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function dayKeyToDate(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00Z`);
}

export function dateToDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(dayKey: string, n: number): string {
  const d = dayKeyToDate(dayKey);
  d.setUTCDate(d.getUTCDate() + n);
  return dateToDayKey(d);
}

export function todayDayKey(timeZone: string): string {
  return localDayKey(new Date(), timeZone);
}

export function weekdayIndex(dayKey: string): number {
  return dayKeyToDate(dayKey).getUTCDay(); // 0 = Sunday
}

export function dayOfMonth(dayKey: string): number {
  return dayKeyToDate(dayKey).getUTCDate();
}

export function monthKey(dayKey: string): string {
  return dayKey.slice(0, 7); // YYYY-MM
}

export function monthKeyToDate(mKey: string): Date {
  return new Date(`${mKey}-01T00:00:00Z`);
}

export function addMonths(mKey: string, n: number): string {
  const d = monthKeyToDate(mKey);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
}

export function daysInMonth(mKey: string): number {
  const d = monthKeyToDate(mKey);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];
export function weekdayInitial(dayKey: string): string {
  return WEEKDAY_INITIALS[weekdayIndex(dayKey)];
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function monthName(mKey: string): string {
  return MONTH_NAMES[monthKeyToDate(mKey).getUTCMonth()];
}

export function monthShort(mKey: string): string {
  return MONTH_SHORT[monthKeyToDate(mKey).getUTCMonth()];
}

export function formatLongDate(dayKey: string): string {
  const d = dayKeyToDate(dayKey);
  return `${WEEKDAY_NAMES[d.getUTCDay()]}, ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function formatShortDate(dayKey: string): string {
  const d = dayKeyToDate(dayKey);
  return `${WEEKDAY_SHORT[d.getUTCDay()]} ${d.getUTCDate()}`;
}

export function formatMonthDayRange(startKey: string, endKey: string): string {
  const s = dayKeyToDate(startKey);
  const e = dayKeyToDate(endKey);
  const startLabel = `${MONTH_SHORT[s.getUTCMonth()]} ${s.getUTCDate()}`;
  const endLabel = s.getUTCMonth() === e.getUTCMonth() ? `${e.getUTCDate()}` : `${MONTH_SHORT[e.getUTCMonth()]} ${e.getUTCDate()}`;
  return `${startLabel} – ${endLabel}`;
}

export function formatTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(instant);
}

/** Start (Sunday) of the calendar week containing dayKey. */
export function startOfWeek(dayKey: string): string {
  return addDays(dayKey, -weekdayIndex(dayKey));
}

export function isFutureDayKey(dayKey: string, todayKey: string): boolean {
  return dayKey > todayKey;
}
