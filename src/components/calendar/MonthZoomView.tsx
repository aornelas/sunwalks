"use client";

import { useEffect, useRef, useState } from "react";
import { addMonths, monthKey as toMonthKey } from "@/lib/dates";
import type { DayData } from "@/lib/types";
import { MonthBlock } from "./MonthBlock";
import styles from "./MonthZoomView.module.css";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

interface MonthZoomViewProps {
  today: string;
  variant: "mobile" | "web";
  filter: boolean;
  getDay(date: string): DayData | undefined;
  ensureLoaded(start: string, end: string): Promise<void>;
  onOpenDay(date: string): void;
  onJumpMonth?: string; // when set, resets the visible window to include this month
}

export function MonthZoomView({
  today,
  variant,
  filter,
  getDay,
  ensureLoaded,
  onOpenDay,
  onJumpMonth,
}: MonthZoomViewProps) {
  const currentMonth = toMonthKey(today);
  const step = variant === "web" ? 2 : 1;
  const [monthsShown, setMonthsShown] = useState(variant === "web" ? 2 : 3);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Adjust state in response to a prop change, computed during render rather
  // than in an effect (see https://react.dev/learn/you-might-not-need-an-effect).
  const [lastJump, setLastJump] = useState(onJumpMonth);
  if (onJumpMonth && onJumpMonth !== lastJump) {
    setLastJump(onJumpMonth);
    const diff =
      (Number(currentMonth.slice(0, 4)) - Number(onJumpMonth.slice(0, 4))) * 12 +
      (Number(currentMonth.slice(5, 7)) - Number(onJumpMonth.slice(5, 7)));
    setMonthsShown((n) => Math.max(n, diff + 1));
  }

  const monthKeys = Array.from({ length: monthsShown }, (_, i) => addMonths(currentMonth, -i));

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

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setMonthsShown((n) => n + step);
        }
      },
      { rootMargin: "800px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [step]);

  const listClass = variant === "web" ? styles.webGrid : styles.mobileList;

  return (
    <div>
      {variant === "mobile" && (
        <div className={styles.weekdayHeader}>
          {WEEKDAY_LABELS.map((label, i) => (
            <span key={i}>{label}</span>
          ))}
        </div>
      )}
      <div className={listClass}>
        {monthKeys.map((mKey) => (
          <MonthBlock
            key={mKey}
            monthKey={mKey}
            today={today}
            variant={variant}
            filter={filter}
            getDay={getDay}
            onOpenDay={onOpenDay}
          />
        ))}
      </div>
      <div ref={sentinelRef} className={styles.sentinel} />
    </div>
  );
}
