"use client";

import { useEffect } from "react";
import { addDays, formatMonthDayRange, formatShortDate, formatTime, startOfWeek } from "@/lib/dates";
import type { DayData } from "@/lib/types";
import styles from "./WeekZoomView.module.css";

interface WeekZoomViewProps {
  today: string;
  timezone: string;
  variant: "mobile" | "web";
  filter: boolean;
  getDay(date: string): DayData | undefined;
  ensureLoaded(start: string, end: string): Promise<void>;
  onOpenDay(date: string): void;
}

export function WeekZoomView({
  today,
  timezone,
  variant,
  filter,
  getDay,
  ensureLoaded,
  onOpenDay,
}: WeekZoomViewProps) {
  const weekCount = variant === "web" ? 1 : 3;
  const currentWeekStart = startOfWeek(today);
  const weekStarts = Array.from({ length: weekCount }, (_, i) => addDays(currentWeekStart, -7 * i));

  useEffect(() => {
    const start = weekStarts[weekStarts.length - 1];
    const end = addDays(weekStarts[0], 6);
    ensureLoaded(start, end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  const gridClass = variant === "web" ? styles.webGrid : styles.mobileGrid;

  return (
    <div>
      {weekStarts.map((weekStart) => {
        const weekEnd = addDays(weekStart, 6);
        const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
        const visibleDays = filter ? days.filter((d) => (getDay(d)?.shots.length ?? 0) > 0) : days;

        return (
          <div key={weekStart} className={styles.week}>
            <span className={styles.label}>{formatMonthDayRange(weekStart, weekEnd)}</span>
            <div className={gridClass}>
              {visibleDays.map((date) => {
                const isToday = date === today;
                const day = getDay(date);
                const dayShot =
                  day && day.shots.length > 0
                    ? (day.shots.find((s) => s.id === day.dayShotId) ?? day.shots[0])
                    : undefined;
                const isFuture = date > today;

                if (dayShot) {
                  return (
                    <button
                      key={date}
                      type="button"
                      className={[styles.cell, styles.captured, isToday ? styles.today : ""].join(" ")}
                      onClick={() => onOpenDay(date)}
                    >
                      <img src={dayShot.thumbUrl} alt="" />
                      <span className={styles.scrim} />
                      <span className={styles.dayLabel}>{formatShortDate(date)}</span>
                      <span className={styles.time}>{formatTime(new Date(dayShot.takenAt), timezone)}</span>
                    </button>
                  );
                }
                if (isFuture) {
                  return (
                    <div key={date} className={[styles.cell, styles.future, isToday ? styles.today : ""].join(" ")}>
                      <span className={styles.futureLabel}>{formatShortDate(date)}</span>
                    </div>
                  );
                }
                return (
                  <div key={date} className={[styles.cell, styles.missed, isToday ? styles.today : ""].join(" ")}>
                    <span className={styles.missedLabel}>{formatShortDate(date)}</span>
                    <span className={styles.noWalk}>no walk</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
