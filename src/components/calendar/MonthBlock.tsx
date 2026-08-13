"use client";

import { buildMonthCells } from "@/lib/calendar-grid";
import { dayOfMonth, monthName } from "@/lib/dates";
import { buildSrcSet } from "@/lib/image";
import type { DayData } from "@/lib/types";
import styles from "./MonthBlock.module.css";

interface MonthBlockProps {
  monthKey: string;
  today: string;
  variant: "mobile" | "web";
  filter: boolean;
  eager?: boolean;
  getDay(date: string): DayData | undefined;
  onOpenDay(date: string): void;
}

export function MonthBlock({ monthKey, today, variant, filter, eager, getDay, onOpenDay }: MonthBlockProps) {
  const allCells = buildMonthCells(monthKey, today, getDay);
  const cells = filter ? allCells.filter((c) => c.state === "captured") : allCells;
  const capturedCount = allCells.filter((c) => c.state === "captured").length;

  return (
    <div id={`month-${monthKey}`} className={`${styles.block} ${styles[variant]}`}>
      <div className={styles.titleRow}>
        <h3 className={styles.title}>{monthName(monthKey)}</h3>
        <span className={styles.count}>{capturedCount} CAPTURED</span>
      </div>
      <div className={styles.grid}>
        {cells.map((cell, i) => {
          if (cell.state === "blank") {
            return <div key={`blank-${i}`} className={styles.cell} />;
          }
          const isToday = cell.date === today;
          const day = getDay(cell.date!);
          const dayShot =
            cell.state === "captured" && day
              ? (day.shots.find((s) => s.id === day.dayShotId) ?? day.shots[0])
              : undefined;
          const stateClass =
            cell.state === "captured" ? styles.captured : cell.state === "future" ? styles.future : styles.missed;

          return (
            <button
              key={cell.date}
              type="button"
              className={[styles.cell, stateClass, isToday ? styles.today : ""].join(" ")}
              onClick={() => cell.state === "captured" && onOpenDay(cell.date!)}
              disabled={cell.state !== "captured"}
              aria-label={cell.date!}
            >
              {dayShot && (
                <img
                  {...buildSrcSet(dayShot.id, "sq")}
                  sizes="(min-width: 900px) 90px, 55px"
                  alt=""
                  loading={eager ? undefined : "lazy"}
                />
              )}
              <span className={styles.dateNumber}>{dayOfMonth(cell.date!)}</span>
              {day && day.shots.length > 1 && (
                <svg className={styles.multiStack} viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <rect x="4" y="0" width="9" height="9" rx="3" fill="#fff" fillOpacity="0.6" />
                  <rect x="0" y="4" width="9" height="9" rx="3" fill="#fff" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
