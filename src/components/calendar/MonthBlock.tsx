"use client";

import { buildMonthCells } from "@/lib/calendar-grid";
import { dayOfMonth, monthName } from "@/lib/dates";
import type { DayData } from "@/lib/types";
import styles from "./MonthBlock.module.css";

interface MonthBlockProps {
  monthKey: string;
  today: string;
  variant: "mobile" | "web";
  filter: boolean;
  getDay(date: string): DayData | undefined;
  onOpenDay(date: string): void;
}

export function MonthBlock({ monthKey, today, variant, filter, getDay, onOpenDay }: MonthBlockProps) {
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
          if (cell.state === "blank" || cell.state === "future") {
            return <div key={cell.date ?? `blank-${i}`} className={styles.cell} />;
          }
          const isToday = cell.date === today;
          const day = getDay(cell.date!);
          const dayShot =
            cell.state === "captured" && day
              ? (day.shots.find((s) => s.id === day.dayShotId) ?? day.shots[0])
              : undefined;

          return (
            <button
              key={cell.date}
              type="button"
              className={[
                styles.cell,
                cell.state === "captured" ? styles.captured : styles.missed,
                isToday ? styles.today : "",
              ].join(" ")}
              onClick={() => cell.state === "captured" && onOpenDay(cell.date!)}
              disabled={cell.state !== "captured"}
              aria-label={cell.date!}
            >
              {dayShot && <img src={dayShot.thumbUrl} alt="" />}
              <span className={styles.dateNumber}>{dayOfMonth(cell.date!)}</span>
              {day && day.shots.length > 1 && <span className={styles.multiDot} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
