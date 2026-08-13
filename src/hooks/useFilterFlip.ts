"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { EASE_SOFT, flipPlay, prefersReducedMotion } from "@/lib/motion";

export interface FlipGhost<T> {
  key: string;
  rect: DOMRect;
  data: T;
}

/**
 * Motion 4 ("filtering the gaps out"), generalized for any single FLIP
 * scope (one month's grid, one week's row, one year's month card). Collapse
 * is opacity + scale on a frozen ghost snapshot, never real layout width —
 * the survivors' reflow is a cheap transform, driven by measuring each
 * item's rect just before and just after the filtered set changes.
 *
 * One instance covers exactly one scope: call it from a component that's
 * mounted once per scope (a WeekBlock, a MonthBlock, a year's month card),
 * never from inside a `.map()` at the top of a growing list — the item
 * count there changes across renders, which hook call order can't do.
 */
export function useFilterFlip<T>(filter: boolean, gapItems: { key: string; data: T }[]) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLElement>());
  const prevRectsRef = useRef(new Map<string, DOMRect>());
  const prevFilterRef = useRef(filter);
  const mountedRef = useRef(false);
  const [ghosts, setGhosts] = useState<FlipGhost<T>[]>([]);

  function setItemRef(key: string) {
    return (el: HTMLElement | null) => {
      if (el) itemRefs.current.set(key, el);
      else itemRefs.current.delete(key);
    };
  }

  useLayoutEffect(() => {
    const filterChanged = mountedRef.current && prevFilterRef.current !== filter;
    const reduced = prefersReducedMotion();

    if (filterChanged && !reduced) {
      const duration = filter ? 600 : 480;
      for (const [key, el] of itemRefs.current) {
        const first = prevRectsRef.current.get(key);
        if (first) flipPlay(el, first, { duration, easing: EASE_SOFT });
      }

      if (filter && containerRef.current) {
        // Gaps just left — replay their last known rect (relative to this
        // scope's own container, so it survives any ancestor transform) as
        // a shrinking, fading ghost layered above the now-reflowed items.
        const containerRect = containerRef.current.getBoundingClientRect();
        const newGhosts: FlipGhost<T>[] = [];
        for (const { key, data } of gapItems) {
          const rect = prevRectsRef.current.get(key);
          if (rect) {
            newGhosts.push({
              key,
              data,
              rect: new DOMRect(rect.left - containerRect.left, rect.top - containerRect.top, rect.width, rect.height),
            });
          }
        }
        if (newGhosts.length) {
          // Deliberately synchronous: newGhosts only exists from rects
          // measured this same commit, so there's no earlier point this
          // could have been computed at.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setGhosts(newGhosts);
          window.setTimeout(() => setGhosts([]), 420);
        }
      }
    }

    const next = new Map<string, DOMRect>();
    for (const [key, el] of itemRefs.current) next.set(key, el.getBoundingClientRect());
    prevRectsRef.current = next;
    prevFilterRef.current = filter;
    mountedRef.current = true;
  }, [filter, gapItems]);

  return { containerRef, setItemRef, ghosts };
}
