"use client";

import { Moon, ChevronRight } from "lucide-react";
import { formatTime } from "@/lib/dates";
import { toneFor } from "@/lib/verdict";
import type { PlanningDay } from "@/lib/types";
import styles from "./PlanningEntryRow.module.css";

interface PlanningEntryRowProps {
  day?: PlanningDay;
  isThisMorning: boolean;
  timezone: string;
  onOpen(): void;
}

/**
 * The dark entry row pinned under the calendar header — a live preview of
 * the next unwalked morning's forecast, so the calendar alone answers "is
 * tomorrow worth it" most nights. See PLANNING.md §Entry row.
 */
export function PlanningEntryRow({ day, isThisMorning, timezone, onOpen }: PlanningEntryRowProps) {
  const tone = day ? toneFor(day.verdict) : undefined;
  return (
    <button type="button" className={`${styles.row} motionPressable`} onClick={onOpen}>
      <Moon size={19} strokeWidth={2.4} color="#e0954f" className={styles.icon} />
      <span className={styles.body}>
        <span className={styles.kicker}>{isThisMorning ? "Plan this morning" : "Plan tomorrow"}</span>
        <span className={styles.line}>
          {day ? (
            <>
              <span className={styles.verdict} style={{ color: tone!.dark }}>
                {day.verdict}
              </span>
              <span className={styles.sunrise}>sunrise {formatTime(new Date(day.sunrise), timezone)}</span>
            </>
          ) : (
            <span className={styles.sunrise}>Checking forecast…</span>
          )}
        </span>
      </span>
      <ChevronRight size={16} strokeWidth={2.75} className={styles.chevron} />
    </button>
  );
}
