"use client";

import { useEffect, useRef, useState } from "react";
import { buildMonthCells } from "@/lib/calendar-grid";
import { monthShort } from "@/lib/dates";
import { buildSrcSet } from "@/lib/image";
import { useFirstPaintEntrance } from "@/lib/motion";
import type { DayData } from "@/lib/types";
import styles from "./YearZoomView.module.css";

const LOAD_MARGIN_PX = 800;

interface YearZoomViewProps {
  today: string;
  variant: "mobile" | "web";
  filter: boolean;
  earliestDate: string | null;
  getDay(date: string): DayData | undefined;
  ensureLoaded(start: string, end: string): Promise<void>;
  onJumpToMonth(monthKey: string): void;
}

export function YearZoomView({
  today,
  variant,
  filter,
  earliestDate,
  getDay,
  ensureLoaded,
  onJumpToMonth,
}: YearZoomViewProps) {
  const currentYear = Number(today.slice(0, 4));
  // Never scroll further back than the year of the earliest capture — with
  // no captures at all there's nothing to scroll to, so cap at just the
  // current year.
  const earliestYear = earliestDate ? Number(earliestDate.slice(0, 4)) : currentYear;
  const maxYears = currentYear - earliestYear + 1;

  const playEntrance = useFirstPaintEntrance();
  const [yearsShown, setYearsShown] = useState(() => Math.min(1, maxYears));
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [initialBatch] = useState(() => yearsShown);
  const years = Array.from({ length: yearsShown }, (_, i) => String(currentYear - i));

  useEffect(() => {
    const oldestYear = years[years.length - 1];
    ensureLoaded(`${oldestYear}-01-01`, `${currentYear}-12-31`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearsShown]);

  // IntersectionObserver only fires on a boundary *crossing*. A single
  // year's grid can land fully inside the load-margin zone on the first
  // render and just stay there — no crossing ever happens, so the observer
  // alone would go silent forever. Keep growing right after render for as
  // long as the sentinel is already inside the zone, so growth isn't
  // waiting on a scroll event that can't occur because there's nothing left
  // to scroll to yet.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || yearsShown >= maxYears) return;
    if (el.getBoundingClientRect().top <= window.innerHeight + LOAD_MARGIN_PX) {
      setYearsShown((n) => Math.min(maxYears, n + 1));
    }
  }, [yearsShown, maxYears]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setYearsShown((n) => Math.min(maxYears, n + 1));
        }
      },
      { rootMargin: `${LOAD_MARGIN_PX}px` },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [maxYears]);

  const gridClass = variant === "web" ? styles.webGrid : styles.mobileGrid;

  return (
    <div>
      {years.map((year, yearIndex) => {
        const monthKeys = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
        const monthsData = monthKeys.map((mKey) => {
          const cells = buildMonthCells(mKey, today, getDay);
          const capturedCount = cells.filter((c) => c.state === "captured").length;
          return { mKey, cells, capturedCount };
        });
        const yearCapturedCount = monthsData.reduce((sum, m) => sum + m.capturedCount, 0);
        const animateIn = playEntrance && yearIndex < initialBatch;

        return (
          <div
            key={year}
            className={`${styles.yearBlock} ${!animateIn && yearIndex >= initialBatch ? "motionPlainFade" : ""}`}
          >
            <div className={styles.yearHeadingRow}>
              <span className={styles.yearHeading}>{year}</span>
              <span className={styles.yearCount}>{yearCapturedCount} CAPTURED</span>
            </div>
            <div className={gridClass}>
              {monthsData.map(({ mKey, cells, capturedCount }, monthIndex) => {
                const visibleCells = filter ? cells.filter((c) => c.state === "captured") : cells;

                return (
                  <button
                    key={mKey}
                    type="button"
                    className={`${styles.month} ${animateIn ? "motionSettleIn motionPressable" : ""}`}
                    style={animateIn ? ({ "--cell-delay": `${monthIndex * 52}ms` } as React.CSSProperties) : undefined}
                    onClick={() => onJumpToMonth(mKey)}
                  >
                    <div className={styles.header}>
                      <span className={styles.name}>{monthShort(mKey)}</span>
                      <span className={styles.count}>{capturedCount > 0 ? capturedCount : "—"}</span>
                    </div>
                    <div className={styles.dotGrid}>
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
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      {yearsShown < maxYears && <div ref={sentinelRef} className={styles.sentinel} />}
    </div>
  );
}
