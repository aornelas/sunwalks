"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { buildMonthCells } from "@/lib/calendar-grid";
import { addMonths, monthKey as toMonthKey } from "@/lib/dates";
import { useFirstPaintEntrance } from "@/lib/motion";
import type { DayData } from "@/lib/types";
import { MonthBlock } from "./MonthBlock";
import styles from "./MonthZoomView.module.css";

const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
const LOAD_MARGIN_PX = 800;

interface MonthZoomViewProps {
  today: string;
  variant: "mobile" | "web";
  filter: boolean;
  earliestDate: string | null;
  getDay(date: string): DayData | undefined;
  ensureLoaded(start: string, end: string): Promise<void>;
  onOpenDay(date: string): void;
  onJumpMonth?: string; // when set, resets the visible window to include this month
  newDates?: ReadonlySet<string>;
}

function monthsBetween(fromKey: string, toKey: string): number {
  return (
    (Number(fromKey.slice(0, 4)) - Number(toKey.slice(0, 4))) * 12 +
    (Number(fromKey.slice(5, 7)) - Number(toKey.slice(5, 7)))
  );
}

export function MonthZoomView({
  today,
  variant,
  filter,
  earliestDate,
  getDay,
  ensureLoaded,
  onOpenDay,
  onJumpMonth,
  newDates,
}: MonthZoomViewProps) {
  const playEntrance = useFirstPaintEntrance();
  const currentMonth = toMonthKey(today);
  const step = variant === "web" ? 2 : 1;
  // Never scroll further back than the month of the earliest capture — with
  // no captures at all there's nothing to scroll to, so cap at just the
  // current month.
  const maxMonths = earliestDate ? monthsBetween(currentMonth, toMonthKey(earliestDate)) + 1 : 1;
  // This view mounts fresh every time the zoom bar switches to "month" (see
  // WebShell/MobileShell), so a jump arriving from the year view is already
  // present on the very first render — the default window must account for
  // it here, not just when onJumpMonth changes on an already-mounted view.
  const [monthsShown, setMonthsShown] = useState(() => {
    const base = variant === "web" ? 2 : 3;
    if (!onJumpMonth) return Math.min(base, maxMonths);
    return Math.min(maxMonths, Math.max(base, monthsBetween(currentMonth, onJumpMonth) + 1));
  });
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Months at/after this index were appended by infinite scroll (or a jump),
  // not present in the initial batch — they get a plain fade, never the
  // entrance stagger (MOTION.md: "never on scroll").
  const [initialBatch] = useState(() => monthsShown);

  // Adjust state in response to a prop change, computed during render rather
  // than in an effect (see https://react.dev/learn/you-might-not-need-an-effect).
  const [lastJump, setLastJump] = useState(onJumpMonth);
  if (onJumpMonth && onJumpMonth !== lastJump) {
    setLastJump(onJumpMonth);
    setMonthsShown((n) => Math.min(maxMonths, Math.max(n, monthsBetween(currentMonth, onJumpMonth) + 1)));
  }

  const monthKeys = Array.from({ length: monthsShown }, (_, i) => addMonths(currentMonth, -i));
  const visibleMonths = monthKeys
    .map((mKey, monthIndex) => ({ mKey, monthIndex }))
    .filter(({ mKey }) => !filter || buildMonthCells(mKey, today, getDay).some((c) => c.state === "captured"));

  useEffect(() => {
    if (!onJumpMonth) return;
    // Wait for the newly-expanded month list to actually paint before scrolling.
    const id = window.setTimeout(() => {
      document.getElementById(`month-${onJumpMonth}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
    return () => window.clearTimeout(id);
  }, [onJumpMonth]);

  useEffect(() => {
    const oldestMonth = monthKeys[monthKeys.length - 1];
    const start = `${oldestMonth}-01`;
    const [y, m] = currentMonth.split("-").map(Number);
    const end = `${y}-${String(m).padStart(2, "0")}-31`;
    ensureLoaded(start, end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthsShown]);

  // IntersectionObserver only fires on a boundary *crossing*. A batch this
  // short can land fully inside the load-margin zone on the very first
  // render and just stay there as more (still-short) batches are appended —
  // no crossing ever happens, so the observer alone would go silent forever.
  // Keep growing right after render for as long as the sentinel is already
  // inside the zone, so growth isn't waiting on a scroll event that can't
  // occur because there's nothing left to scroll to yet.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || monthsShown >= maxMonths) return;
    if (el.getBoundingClientRect().top <= window.innerHeight + LOAD_MARGIN_PX) {
      setMonthsShown((n) => Math.min(maxMonths, n + step));
    }
  }, [monthsShown, step, maxMonths]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setMonthsShown((n) => Math.min(maxMonths, n + step));
        }
      },
      { rootMargin: `${LOAD_MARGIN_PX}px` },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [step, maxMonths]);

  const listClass = variant === "web" ? styles.webGrid : styles.mobileList;
  // Rendered outside the grid/flex list below (which, unlike a plain block
  // container, doesn't let a first child's margin collapse with the header
  // above it) so the very first year label lines up with Week/Year view
  // regardless of variant — see the DoW-row placement note below.
  const topYear = visibleMonths.length > 0 ? visibleMonths[0].mKey.slice(0, 4) : null;

  return (
    <div>
      {topYear && <div className={styles.yearLabel}>{topYear}</div>}
      {variant === "mobile" && !filter && (
        <div className={styles.weekdayHeader}>
          {WEEKDAY_LABELS.map((label, i) => (
            <span key={i}>{label}</span>
          ))}
        </div>
      )}
      <div className={listClass}>
        {visibleMonths.map(({ mKey, monthIndex }, i) => {
          const year = mKey.slice(0, 4);
          const showYearLabel = i > 0 && year !== visibleMonths[i - 1].mKey.slice(0, 4);
          return (
            <Fragment key={mKey}>
              {showYearLabel && <div className={styles.yearLabel}>{year}</div>}
              <MonthBlock
                monthKey={mKey}
                today={today}
                variant={variant}
                filter={filter}
                eager={monthIndex < 2}
                animateIn={playEntrance && monthIndex < initialBatch}
                scrollLoaded={monthIndex >= initialBatch}
                getDay={getDay}
                onOpenDay={onOpenDay}
                newDates={newDates}
              />
            </Fragment>
          );
        })}
      </div>
      {monthsShown < maxMonths && <div ref={sentinelRef} className={styles.sentinel} />}
    </div>
  );
}
