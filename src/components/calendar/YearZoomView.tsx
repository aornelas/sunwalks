"use client";

import { useEffect } from "react";
import { buildMonthCells } from "@/lib/calendar-grid";
import { monthShort } from "@/lib/dates";
import { buildSrcSet } from "@/lib/image";
import type { DayData } from "@/lib/types";
import styles from "./YearZoomView.module.css";

interface YearZoomViewProps {
  today: string;
  variant: "mobile" | "web";
  filter: boolean;
  getDay(date: string): DayData | undefined;
  ensureLoaded(start: string, end: string): Promise<void>;
  onJumpToMonth(monthKey: string): void;
}

export function YearZoomView({ today, variant, filter, getDay, ensureLoaded, onJumpToMonth }: YearZoomViewProps) {
  const year = today.slice(0, 4);

  useEffect(() => {
    ensureLoaded(`${year}-01-01`, `${year}-12-31`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const monthKeys = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const gridClass = variant === "web" ? styles.webGrid : styles.mobileGrid;

  return (
    <div className={gridClass}>
      {monthKeys.map((mKey) => {
        const cells = buildMonthCells(mKey, today, getDay);
        const capturedCount = cells.filter((c) => c.state === "captured").length;
        const visibleCells = filter ? cells.filter((c) => c.state === "captured") : cells;

        return (
          <button key={mKey} type="button" className={styles.month} onClick={() => onJumpToMonth(mKey)}>
            <div className={styles.header}>
              <span className={styles.name}>{monthShort(mKey)}</span>
              <span className={styles.count}>{capturedCount > 0 ? capturedCount : "—"}</span>
            </div>
            <div className={styles.dotGrid}>
              {visibleCells.map((cell, i) => {
                if (cell.state === "blank" || cell.state === "future") {
                  return <div key={cell.date ?? `b-${i}`} className={styles.dot} />;
                }
                const isToday = cell.date === today;
                const day = cell.state === "captured" ? getDay(cell.date!) : undefined;
                const shot = day && (day.shots.find((s) => s.id === day.dayShotId) ?? day.shots[0]);
                return (
                  <div
                    key={cell.date}
                    className={[styles.dot, cell.state === "missed" ? styles.missed : "", isToday ? styles.today : ""].join(" ")}
                  >
                    {shot && <img {...buildSrcSet(shot.id, "sq")} sizes="20px" alt="" loading="lazy" />}
                  </div>
                );
              })}
            </div>
          </button>
        );
      })}
    </div>
  );
}
