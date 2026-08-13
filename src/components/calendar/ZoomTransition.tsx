"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { EASE_EXIT, EASE_STANDARD, prefersReducedMotion } from "@/lib/motion";

interface Slot {
  key: string;
  node: ReactNode;
}

/**
 * Motion 3 ("changing zoom"): the outgoing grid fades + shrinks out while
 * the incoming one fades + settles in, briefly overlapping — never a
 * sideways slide, since this is a change of scale, not of place.
 *
 * `current` always mirrors the live `children` prop (so a prop change that
 * isn't a zoom switch — the filter toggling, new day data arriving —
 * reaches the rendered tree immediately, not just on the next zoom
 * change). `leaving` is only ever a one-time snapshot, frozen the instant
 * `zoomKey` changes. Both are adjusted during render, not mirrored via an
 * effect — see https://react.dev/learn/you-might-not-need-an-effect
 */
export function ZoomTransition({ zoomKey, children }: { zoomKey: string; children: ReactNode }) {
  const [current, setCurrent] = useState<Slot>({ key: zoomKey, node: children });
  const [leaving, setLeaving] = useState<Slot | null>(null);
  const currentElRef = useRef<HTMLDivElement>(null);
  const leavingElRef = useRef<HTMLDivElement>(null);

  if (zoomKey !== current.key) {
    if (!prefersReducedMotion()) setLeaving(current);
    setCurrent({ key: zoomKey, node: children });
  } else if (children !== current.node) {
    setCurrent({ key: zoomKey, node: children });
  }

  useLayoutEffect(() => {
    if (!leaving) return;
    const outgoing = leavingElRef.current;
    const incoming = currentElRef.current;
    if (outgoing) {
      outgoing
        .animate([{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(.965)" }], {
          duration: 320,
          easing: EASE_EXIT,
          fill: "forwards",
        })
        .finished.catch(() => {})
        .finally(() => setLeaving((l) => (l === leaving ? null : l)));
    }
    incoming?.animate([{ opacity: 0, transform: "scale(1.035)" }, { opacity: 1, transform: "scale(1)" }], {
      duration: 480,
      delay: 160,
      easing: EASE_STANDARD,
      fill: "backwards",
    });
  }, [leaving]);

  return (
    <div style={{ position: "relative" }}>
      {leaving && (
        <div ref={leavingElRef} style={{ position: "absolute", inset: 0, top: 0 }}>
          {leaving.node}
        </div>
      )}
      <div ref={currentElRef}>{current.node}</div>
    </div>
  );
}
