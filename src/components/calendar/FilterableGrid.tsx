"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { dayOfMonth } from "@/lib/dates";
import { buildSrcSet } from "@/lib/image";
import { EASE_SOFT, flipPlay, prefersReducedMotion } from "@/lib/motion";
import { setPendingOrigin } from "@/lib/photo-origin";
import type { GridCell } from "@/lib/calendar-grid";
import type { DayData } from "@/lib/types";
import { CrossfadeImg } from "./CrossfadeImg";
import styles from "./MonthBlock.module.css";

interface Ghost {
  key: string;
  rect: DOMRect;
  kind: "missed" | "future";
}

interface FilterableGridProps {
  filter: boolean;
  cells: GridCell[];
  animateIn?: boolean;
  eager?: boolean;
  today: string;
  getDay(date: string): DayData | undefined;
  onOpenDay(date: string): void;
  newDates?: ReadonlySet<string>;
}

/**
 * Motion 4 ("filtering the gaps out"): a FLIP grid. Missed/future squares
 * collapse out (or grow back in) via opacity + scale — never real width, so
 * the reflow itself stays a cheap transform on the surviving squares rather
 * than a synchronous layout thrash across a year of cells.
 */
export function FilterableGrid({
  filter,
  cells,
  animateIn,
  eager,
  today,
  getDay,
  onOpenDay,
  newDates,
}: FilterableGridProps) {
  const visibleCells = filter ? cells.filter((c) => c.state === "captured") : cells;
  const gridRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef(new Map<string, HTMLElement>());
  const prevRectsRef = useRef(new Map<string, DOMRect>());
  const prevFilterRef = useRef(filter);
  const mountedRef = useRef(false);
  const [ghosts, setGhosts] = useState<Ghost[]>([]);

  useLayoutEffect(() => {
    const filterChanged = mountedRef.current && prevFilterRef.current !== filter;
    const reduced = prefersReducedMotion();

    if (filterChanged && !reduced) {
      const duration = filter ? 600 : 480;
      for (const [key, el] of cellRefs.current) {
        const first = prevRectsRef.current.get(key);
        if (!first) continue;
        const anim = flipPlay(el, first, { duration, easing: EASE_SOFT });
        if (anim) el.dataset.flipping = "1";
        anim?.finished
          .catch(() => {})
          .finally(() => {
            delete el.dataset.flipping;
          });
      }

      if (filter && gridRef.current) {
        // Gaps just left the grid — replay their last known rect (relative
        // to the grid container, so it survives any ancestor transform) as
        // a shrinking, fading ghost layered above the now-reflowed grid.
        const gridRect = gridRef.current.getBoundingClientRect();
        const newGhosts: Ghost[] = [];
        for (const cell of cells) {
          if (cell.state !== "missed" && cell.state !== "future") continue;
          const key = cell.date ?? `blank`;
          const rect = prevRectsRef.current.get(key);
          if (rect) {
            newGhosts.push({
              key,
              kind: cell.state,
              rect: new DOMRect(rect.left - gridRect.left, rect.top - gridRect.top, rect.width, rect.height),
            });
          }
        }
        if (newGhosts.length) {
          // Deliberately synchronous: newGhosts only exists from rects
          // measured this same commit (getBoundingClientRect above), so
          // there's no earlier point this could have been computed at —
          // not a case "you might not need an effect" applies to.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setGhosts(newGhosts);
          window.setTimeout(() => setGhosts([]), 420);
        }
      }
    }

    // Snapshot current positions for next time.
    const next = new Map<string, DOMRect>();
    for (const [key, el] of cellRefs.current) next.set(key, el.getBoundingClientRect());
    prevRectsRef.current = next;
    prevFilterRef.current = filter;
    mountedRef.current = true;
  }, [filter, cells]);

  return (
    <div ref={gridRef} className={`${styles.grid} ${styles.gridRelative}`}>
      {visibleCells.map((cell, i) => {
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
        const row = Math.floor(i / 7);
        const col = i % 7;
        const isNew = cell.state === "captured" && newDates?.has(cell.date!);

        return (
          <button
            key={cell.date}
            ref={(el) => {
              if (el) cellRefs.current.set(cell.date!, el);
              else cellRefs.current.delete(cell.date!);
            }}
            type="button"
            className={[
              styles.cell,
              stateClass,
              isToday ? styles.today : "",
              "motionPressable",
              animateIn ? "motionSettleIn" : "",
              isNew ? "motionPop motionRipple" : "",
            ].join(" ")}
            style={animateIn ? ({ "--cell-delay": `${(row + col) * 52}ms` } as React.CSSProperties) : undefined}
            onClick={(e) => {
              if (cell.state !== "captured") return;
              if (dayShot) setPendingOrigin(e.currentTarget.getBoundingClientRect(), buildSrcSet(dayShot.id, "sq").src);
              onOpenDay(cell.date!);
            }}
            disabled={cell.state !== "captured"}
            aria-label={cell.date!}
          >
            {dayShot && (
              <span className={styles.cellClip}>
                <CrossfadeImg
                  {...buildSrcSet(dayShot.id, "sq")}
                  sizes="(min-width: 900px) 90px, 55px"
                  alt=""
                  loading={eager ? "eager" : "lazy"}
                />
              </span>
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
      {ghosts.map((g) => (
        <div
          key={g.key}
          className={`${styles.cell} ${g.kind === "missed" ? styles.missed : styles.future} ${styles.ghost}`}
          style={{
            position: "absolute",
            left: g.rect.left,
            top: g.rect.top,
            width: g.rect.width,
            height: g.rect.height,
            margin: 0,
          }}
        />
      ))}
    </div>
  );
}
