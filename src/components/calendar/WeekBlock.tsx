"use client";

import { formatMonthDayRange, formatShortDate, formatTime, weekOfYear } from "@/lib/dates";
import { buildSrcSet } from "@/lib/image";
import { setPendingOrigin } from "@/lib/photo-origin";
import { useFilterFlip } from "@/hooks/useFilterFlip";
import type { DayData } from "@/lib/types";
import { CrossfadeImg } from "./CrossfadeImg";
import styles from "./WeekZoomView.module.css";

interface WeekBlockProps {
  weekStart: string;
  weekEnd: string;
  days: string[];
  today: string;
  timezone: string;
  filter: boolean;
  gridClass: string;
  animateIn?: boolean;
  getDay(date: string): DayData | undefined;
  onOpenDay(date: string): void;
}

/** One week's row — its own FLIP scope for motion 4 ("filtering the gaps out"). */
export function WeekBlock({
  weekStart,
  weekEnd,
  days,
  today,
  timezone,
  filter,
  gridClass,
  animateIn,
  getDay,
  onOpenDay,
}: WeekBlockProps) {
  const gapDays = days.filter((d) => (getDay(d)?.shots.length ?? 0) === 0);
  const { containerRef, setItemRef, ghosts } = useFilterFlip(
    filter,
    gapDays.map((d) => ({ key: d, data: { isFuture: d > today } })),
  );
  const visibleDays = filter ? days.filter((d) => (getDay(d)?.shots.length ?? 0) > 0) : days;

  return (
    <div className={styles.week}>
      <span className={styles.label}>
        Week {weekOfYear(weekStart)} ({formatMonthDayRange(weekStart, weekEnd)})
      </span>
      <div ref={containerRef} className={`${gridClass} ${styles.gridRelative}`}>
        {visibleDays.map((date, colIndex) => {
          const isToday = date === today;
          const day = getDay(date);
          const dayShot =
            day && day.shots.length > 0 ? (day.shots.find((s) => s.id === day.dayShotId) ?? day.shots[0]) : undefined;
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
                ref={setItemRef(date)}
                type="button"
                className={[
                  styles.cell,
                  styles.captured,
                  isToday ? styles.today : "",
                  "motionPressable",
                  entranceProps.className,
                ].join(" ")}
                style={entranceProps.style}
                onClick={(e) => {
                  setPendingOrigin(e.currentTarget.getBoundingClientRect(), buildSrcSet(dayShot.id, "sq").src);
                  onOpenDay(date);
                }}
              >
                <CrossfadeImg {...buildSrcSet(dayShot.id, "sq")} sizes="(min-width: 900px) 160px, 25vw" alt="" />
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
                ref={setItemRef(date)}
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
              ref={setItemRef(date)}
              className={[styles.cell, styles.missed, isToday ? styles.today : "", entranceProps.className].join(" ")}
              style={entranceProps.style}
            >
              <span className={styles.missedLabel}>{formatShortDate(date)}</span>
              <span className={styles.noWalk}>no walk</span>
            </div>
          );
        })}
        {ghosts.map((g) => (
          <div
            key={g.key}
            className={`${styles.cell} ${g.data.isFuture ? styles.future : styles.missed} ${styles.ghost}`}
            style={{
              position: "absolute",
              left: g.rect.left,
              top: g.rect.top,
              width: g.rect.width,
              height: g.rect.height,
              margin: 0,
            }}
          />
        ))}
      </div>
    </div>
  );
}
