"use client";

import { buildMonthCells } from "@/lib/calendar-grid";
import { monthName } from "@/lib/dates";
import type { DayData } from "@/lib/types";
import { FilterableGrid } from "./FilterableGrid";
import styles from "./MonthBlock.module.css";

interface MonthBlockProps {
  monthKey: string;
  today: string;
  variant: "mobile" | "web";
  filter: boolean;
  eager?: boolean;
  /** Plays motion 1 (the diagonal settle-in stagger) — first paint only. */
  animateIn?: boolean;
  /** A month appended by infinite scroll gets a plain fade instead. */
  scrollLoaded?: boolean;
  getDay(date: string): DayData | undefined;
  onOpenDay(date: string): void;
  /** New captures from a sync — plays motion 5's pop + ripple. */
  newDates?: ReadonlySet<string>;
}

export function MonthBlock({
  monthKey,
  today,
  variant,
  filter,
  eager,
  animateIn,
  scrollLoaded,
  getDay,
  onOpenDay,
  newDates,
}: MonthBlockProps) {
  const allCells = buildMonthCells(monthKey, today, getDay);
  const capturedCount = allCells.filter((c) => c.state === "captured").length;

  return (
    <div
      id={`month-${monthKey}`}
      className={`${styles.block} ${styles[variant]} ${scrollLoaded ? "motionPlainFade" : ""}`}
    >
      <div className={styles.titleRow}>
        <h3 className={styles.title}>{monthName(monthKey)}</h3>
        <span className={styles.count}>{capturedCount} CAPTURED</span>
      </div>
      <FilterableGrid
        filter={filter}
        cells={allCells}
        animateIn={animateIn}
        eager={eager}
        today={today}
        getDay={getDay}
        onOpenDay={onOpenDay}
        newDates={newDates}
      />
    </div>
  );
}
