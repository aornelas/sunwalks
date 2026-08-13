"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { EASE_EXIT, EASE_STANDARD, prefersReducedMotion } from "@/lib/motion";

interface Slot {
  key: string | null;
  node: ReactNode;
}

const EMPTY: Slot = { key: null, node: null };

/**
 * Motion 3 ("changing zoom"): the outgoing grid fades + shrinks out while
 * the incoming one fades + settles in, briefly overlapping — never a
 * sideways slide, since this is a change of scale, not of place.
 *
 * Two fixed-identity slots (0 and 1) ping-pong the "active" and "leaving"
 * roles between transitions. Content is never handed from one wrapper div
 * to another — an earlier version of this component did exactly that
 * (relocating the same rendered node into a different div for its exit),
 * and React treats a subtree moved to a new parent as unmounted-then-
 * remounted, which flashed every thumbnail reloading on each zoom switch.
 */
export function ZoomTransition({ zoomKey, children }: { zoomKey: string; children: ReactNode }) {
  const [slots, setSlots] = useState<[Slot, Slot]>([{ key: zoomKey, node: children }, EMPTY]);
  const [activeIndex, setActiveIndex] = useState<0 | 1>(0);
  const [leavingIndex, setLeavingIndex] = useState<0 | 1 | null>(null);
  const slot0Ref = useRef<HTMLDivElement>(null);
  const slot1Ref = useRef<HTMLDivElement>(null);
  const refs = [slot0Ref, slot1Ref] as const;

  if (zoomKey !== slots[activeIndex].key) {
    const nextIndex: 0 | 1 = activeIndex === 0 ? 1 : 0;
    setSlots((s) => {
      const next = [...s] as [Slot, Slot];
      next[nextIndex] = { key: zoomKey, node: children };
      return next;
    });
    if (!prefersReducedMotion()) setLeavingIndex(activeIndex);
    setActiveIndex(nextIndex);
  } else if (children !== slots[activeIndex].node) {
    setSlots((s) => {
      const next = [...s] as [Slot, Slot];
      next[activeIndex] = { ...next[activeIndex], node: children };
      return next;
    });
  }

  useLayoutEffect(() => {
    if (leavingIndex === null) return;
    const outgoing = refs[leavingIndex].current;
    const incoming = refs[activeIndex].current;
    // Captured so the cleanup below can tell "this slot is still showing
    // the content that started leaving" apart from "a rapid second switch
    // already repurposed this slot for something new" — clearing the
    // latter would wipe out content that's supposed to be active now.
    const leavingKeyAtStart = slots[leavingIndex].key;
    if (outgoing) {
      outgoing
        .animate([{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(.965)" }], {
          duration: 320,
          easing: EASE_EXIT,
          fill: "forwards",
        })
        .finished.catch(() => {})
        .finally(() => {
          setLeavingIndex((li) => (li === leavingIndex ? null : li));
          setSlots((s) => {
            if (s[leavingIndex].key !== leavingKeyAtStart) return s;
            const next = [...s] as [Slot, Slot];
            next[leavingIndex] = EMPTY;
            return next;
          });
        });
    }
    incoming?.animate([{ opacity: 0, transform: "scale(1.035)" }, { opacity: 1, transform: "scale(1)" }], {
      duration: 480,
      delay: 160,
      easing: EASE_STANDARD,
      fill: "backwards",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leavingIndex]);

  return (
    <div style={{ position: "relative" }}>
      {([0, 1] as const).map((i) => {
        if (slots[i].node === null) return null;
        const isLeaving = i === leavingIndex;
        return (
          <div key={i} ref={refs[i]} style={isLeaving ? { position: "absolute", inset: 0, top: 0 } : undefined}>
            {slots[i].node}
          </div>
        );
      })}
    </div>
  );
}
