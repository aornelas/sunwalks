import { daysInMonth, monthKeyToDate, weekdayIndex } from "./dates";
import type { DayData } from "./types";

export type CellState = "blank" | "captured" | "missed" | "future";

export interface GridCell {
  date: string | null;
  state: CellState;
}

export function buildMonthCells(
  mKey: string,
  todayKey: string,
  getDay: (date: string) => DayData | undefined,
): GridCell[] {
  const firstOfMonth = `${mKey}-01`;
  // Grid rows start Monday, so shift the Sunday-indexed weekday (0 = Sunday)
  // to a Monday-indexed leading-blank count (0 = Monday ... 6 = Sunday).
  const leading = (weekdayIndex(firstOfMonth) + 6) % 7;
  const total = daysInMonth(mKey);
  const year = monthKeyToDate(mKey).getUTCFullYear();
  const month = monthKeyToDate(mKey).getUTCMonth();

  const cells: GridCell[] = Array.from({ length: leading }, () => ({ date: null, state: "blank" }));

  for (let day = 1; day <= total; day++) {
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    let state: CellState;
    if (date > todayKey) state = "future";
    else if ((getDay(date)?.shots.length ?? 0) > 0) state = "captured";
    else state = "missed";
    cells.push({ date, state });
  }

  return cells;
}
