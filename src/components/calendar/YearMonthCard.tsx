"use client";

import { monthShort } from "@/lib/dates";
import { buildSrcSet } from "@/lib/image";
import { useFilterFlip } from "@/hooks/useFilterFlip";
import type { GridCell } from "@/lib/calendar-grid";
import type { DayData } from "@/lib/types";
import styles from "./YearZoomView.module.css";

interface YearMonthCardProps {
  monthKey: string;
  cells: GridCell[];
  capturedCount: number;
  today: string;
  filter: boolean;
  animateIn?: boolean;
  cellDelay?: number;
  getDay(date: string): DayData | undefined;
  onJumpToMonth(monthKey: string): void;
}

/** One month's dot grid — its own FLIP scope for motion 4 ("filtering the gaps out"). */
export function YearMonthCard({
  monthKey,
  cells,
  capturedCount,
  today,
  filter,
  animateIn,
  cellDelay,
  getDay,
  onJumpToMonth,
}: YearMonthCardProps) {
  const gapCells = cells.filter((c) => c.state === "missed" || c.state === "future");
  const { containerRef, setItemRef, ghosts } = useFilterFlip(
    filter,
    gapCells.map((c) => ({ key: c.date!, data: { isFuture: c.state === "future" } })),
  );
  const visibleCells = filter ? cells.filter((c) => c.state === "captured") : cells;

  return (
    <button
      type="button"
      className={`${styles.month} ${animateIn ? "motionSettleIn motionPressable" : ""}`}
      style={animateIn ? ({ "--cell-delay": `${cellDelay}ms` } as React.CSSProperties) : undefined}
      onClick={() => onJumpToMonth(monthKey)}
    >
      <div className={styles.header}>
        <span className={styles.name}>{monthShort(monthKey)}</span>
        <span className={styles.count}>{capturedCount > 0 ? capturedCount : "—"}</span>
      </div>
      <div ref={containerRef} className={`${styles.dotGrid} ${styles.gridRelative}`}>
        {visibleCells.map((cell, i) => {
          if (cell.state === "blank") {
            return <div key={`b-${i}`} className={styles.dot} />;
          }
          const isToday = cell.date === today;
          const day = cell.state === "captured" ? getDay(cell.date!) : undefined;
          const shot = day && (day.shots.find((s) => s.id === day.dayShotId) ?? day.shots[0]);
          return (
            <div
              key={cell.date}
              ref={setItemRef(cell.date!)}
              className={[
                styles.dot,
                cell.state === "missed" ? styles.missed : cell.state === "future" ? styles.future : "",
                isToday ? styles.today : "",
              ].join(" ")}
            >
              {shot && <img {...buildSrcSet(shot.id, "sq")} sizes="20px" alt="" loading="lazy" />}
            </div>
          );
        })}
        {ghosts.map((g) => (
          <div
            key={g.key}
            className={`${styles.dot} ${g.data.isFuture ? styles.future : styles.missed} ${styles.ghost}`}
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
    </button>
  );
}
