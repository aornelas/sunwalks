"use client";

import { addDays, weekdayInitial } from "@/lib/dates";
import type { DayData } from "@/lib/types";
import styles from "./WeekStrip.module.css";

interface WeekStripProps {
  today: string;
  getDay(date: string): DayData | undefined;
  onOpenDay(date: string): void;
}

export function WeekStrip({ today, getDay, onOpenDay }: WeekStripProps) {
  const dayKeys = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));

  return (
    <div className={styles.strip}>
      {dayKeys.map((date) => {
        const day = getDay(date);
        const shot = day && (day.shots.find((s) => s.id === day.dayShotId) ?? day.shots[0]);
        const isToday = date === today;
        return (
          <div key={date} className={styles.col}>
            {shot ? (
              <button
                type="button"
                className={styles.circleButton}
                onClick={() => onOpenDay(date)}
                aria-label={`Open sunrise for ${date}`}
              >
                <div className={`${styles.circle} ${isToday ? styles.today : ""}`}>
                  <img src={shot.thumbUrl} alt="" />
                </div>
              </button>
            ) : (
              <div className={`${styles.circle} ${isToday ? styles.today : ""}`} />
            )}
            <span className={styles.initial}>{weekdayInitial(date)}</span>
          </div>
        );
      })}
    </div>
  );
}
