"use client";

import { addDays, weekdayInitial } from "@/lib/dates";
import { buildSrcSet } from "@/lib/image";
import { setPendingOrigin } from "@/lib/photo-origin";
import type { DayData } from "@/lib/types";
import { CrossfadeImg } from "./CrossfadeImg";
import styles from "./WeekStrip.module.css";

interface WeekStripProps {
  today: string;
  getDay(date: string): DayData | undefined;
  onOpenDay(date: string): void;
  newDates?: ReadonlySet<string>;
}

export function WeekStrip({ today, getDay, onOpenDay, newDates }: WeekStripProps) {
  const dayKeys = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));

  return (
    <div className={styles.strip}>
      {dayKeys.map((date) => {
        const day = getDay(date);
        const shot = day && (day.shots.find((s) => s.id === day.dayShotId) ?? day.shots[0]);
        const isToday = date === today;
        const isNew = shot && newDates?.has(date);
        return (
          <div key={date} className={styles.col}>
            {shot ? (
              <button
                type="button"
                className={[styles.circleButton, "motionPressable", isNew ? styles.ripple : ""].join(" ")}
                onClick={(e) => {
                  setPendingOrigin(e.currentTarget.getBoundingClientRect(), buildSrcSet(shot.id, "sq").src);
                  onOpenDay(date);
                }}
                aria-label={`Open sunwalk for ${date}`}
              >
                <div className={[styles.circle, isToday ? styles.today : "", isNew ? "motionPop" : ""].join(" ")}>
                  <CrossfadeImg {...buildSrcSet(shot.id, "sq")} sizes="55px" alt="" fetchPriority="high" />
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
