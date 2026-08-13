"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import {
  addDays,
  dayKeyToDate,
  formatMonthDayRange,
  formatShortDate,
  formatTime,
  startOfWeek,
  weekOfYear,
} from "@/lib/dates";
import { buildSrcSet } from "@/lib/image";
import { useFirstPaintEntrance } from "@/lib/motion";
import { setPendingOrigin } from "@/lib/photo-origin";
import type { DayData } from "@/lib/types";
import styles from "./WeekZoomView.module.css";

const LOAD_MARGIN_PX = 800;
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

function weeksBetween(fromWeekStart: string, toWeekStart: string): number {
  return Math.round((dayKeyToDate(fromWeekStart).getTime() - dayKeyToDate(toWeekStart).getTime()) / MS_PER_WEEK);
}

interface WeekZoomViewProps {
  today: string;
  timezone: string;
  variant: "mobile" | "web";
  filter: boolean;
  earliestDate: string | null;
  getDay(date: string): DayData | undefined;
  ensureLoaded(start: string, end: string): Promise<void>;
  onOpenDay(date: string): void;
}

export function WeekZoomView({
  today,
  timezone,
  variant,
  filter,
  earliestDate,
  getDay,
  ensureLoaded,
  onOpenDay,
}: WeekZoomViewProps) {
  const playEntrance = useFirstPaintEntrance();
  const step = variant === "web" ? 1 : 3;
  const currentWeekStart = startOfWeek(today);
  // Never scroll further back than the week of the earliest capture — with
  // no captures at all there's nothing to scroll to, so cap at just the
  // current week.
  const maxWeeks = earliestDate ? weeksBetween(currentWeekStart, startOfWeek(earliestDate)) + 1 : 1;
  const [weekCount, setWeekCount] = useState(() => Math.min(step, maxWeeks));
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [initialBatch] = useState(() => weekCount);
  const weekStarts = Array.from({ length: weekCount }, (_, i) => addDays(currentWeekStart, -7 * i));

  useEffect(() => {
    const start = weekStarts[weekStarts.length - 1];
    const end = addDays(weekStarts[0], 6);
    ensureLoaded(start, end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekCount]);

  // IntersectionObserver only fires on a boundary *crossing*. A batch this
  // short can land fully inside the load-margin zone on the very first
  // render and just stay there as more (still-short) batches are appended —
  // no crossing ever happens, so the observer alone would go silent forever.
  // Keep growing right after render for as long as the sentinel is already
  // inside the zone, so growth isn't waiting on a scroll event that can't
  // occur because there's nothing left to scroll to yet.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || weekCount >= maxWeeks) return;
    if (el.getBoundingClientRect().top <= window.innerHeight + LOAD_MARGIN_PX) {
      setWeekCount((n) => Math.min(maxWeeks, n + step));
    }
  }, [weekCount, step, maxWeeks]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setWeekCount((n) => Math.min(maxWeeks, n + step));
        }
      },
      { rootMargin: `${LOAD_MARGIN_PX}px` },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [step, maxWeeks]);

  const gridClass = variant === "web" ? styles.webGrid : styles.mobileGrid;

  return (
    <div>
      {weekStarts.map((weekStart, weekIndex) => {
        const weekEnd = addDays(weekStart, 6);
        const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
        const visibleDays = filter ? days.filter((d) => (getDay(d)?.shots.length ?? 0) > 0) : days;
        const year = weekStart.slice(0, 4);
        const showYearLabel = weekIndex === 0 || year !== weekStarts[weekIndex - 1].slice(0, 4);
        const animateIn = playEntrance && weekIndex < initialBatch;

        return (
          <Fragment key={weekStart}>
            {showYearLabel && <div className={styles.yearLabel}>{year}</div>}
            <div className={`${styles.week} ${!animateIn && weekIndex >= initialBatch ? "motionPlainFade" : ""}`}>
              <span className={styles.label}>
                Week {weekOfYear(weekStart)} ({formatMonthDayRange(weekStart, weekEnd)})
              </span>
              <div className={gridClass}>
              {visibleDays.map((date, colIndex) => {
                const isToday = date === today;
                const day = getDay(date);
                const dayShot =
                  day && day.shots.length > 0
                    ? (day.shots.find((s) => s.id === day.dayShotId) ?? day.shots[0])
                    : undefined;
                const isFuture = date > today;
                const entranceProps = animateIn
                  ? {
                      className: "motionSettleIn",
                      style: { "--cell-delay": `${colIndex * 52}ms` } as React.CSSProperties,
                    }
                  : { className: "", style: undefined };

                if (dayShot) {
                  return (
                    <button
                      key={date}
                      type="button"
                      className={[styles.cell, styles.captured, isToday ? styles.today : "", "motionPressable", entranceProps.className].join(" ")}
                      style={entranceProps.style}
                      onClick={(e) => {
                        setPendingOrigin(e.currentTarget.getBoundingClientRect(), buildSrcSet(dayShot.id, "sq").src);
                        onOpenDay(date);
                      }}
                    >
                      <img
                        {...buildSrcSet(dayShot.id, "sq")}
                        sizes="(min-width: 900px) 160px, 25vw"
                        alt=""
                      />
                      <span className={styles.scrim} />
                      <span className={styles.dayLabel}>{formatShortDate(date)}</span>
                      <span className={styles.time}>{formatTime(new Date(dayShot.takenAt), timezone)}</span>
                    </button>
                  );
                }
                if (isFuture) {
                  return (
                    <div
                      key={date}
                      className={[styles.cell, styles.future, isToday ? styles.today : "", entranceProps.className].join(" ")}
                      style={entranceProps.style}
                    >
                      <span className={styles.futureLabel}>{formatShortDate(date)}</span>
                    </div>
                  );
                }
                return (
                  <div
                    key={date}
                    className={[styles.cell, styles.missed, isToday ? styles.today : "", entranceProps.className].join(" ")}
                    style={entranceProps.style}
                  >
                    <span className={styles.missedLabel}>{formatShortDate(date)}</span>
                    <span className={styles.noWalk}>no walk</span>
                  </div>
                );
              })}
              </div>
            </div>
          </Fragment>
        );
      })}
      {weekCount < maxWeeks && <div ref={sentinelRef} className={styles.sentinel} />}
    </div>
  );
}
