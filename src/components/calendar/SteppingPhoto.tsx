"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { EASE_STANDARD, prefersReducedMotion } from "@/lib/motion";

interface Slot {
  key: string;
  node: ReactNode;
}

interface SteppingPhotoProps {
  /** Any change retriggers a transition. */
  stepKey: string;
  /** 1 = stepped forward, -1 = stepped backward, 0 = same day, new shot (crossfade only). */
  direction: 1 | -1 | 0;
  children: ReactNode;
}

/**
 * Motion 9 ("stepping between mornings"): the photo translates a full
 * width in the direction of travel. A same-day shot swap (direction 0)
 * just crossfades instead — there's no "direction" to a different angle
 * of the same morning.
 */
export function SteppingPhoto({ stepKey, direction, children }: SteppingPhotoProps) {
  const [slots, setSlots] = useState<Slot[]>([{ key: stepKey, node: children }]);
  const prevKeyRef = useRef(stepKey);
  const elRefs = useRef(new Map<string, HTMLDivElement>());

  useLayoutEffect(() => {
    // No transition to run — the render below already shows the live
    // `children` for the current key, so there's nothing to sync into
    // state here. (There used to be a setSlots call in this branch; it
    // went stale whenever `children` changed for a reason other than
    // `stepKey`/`direction` — e.g. toggling LandscapePhotoView's "fit"
    // button changes the photo's className without changing the shot —
    // since this effect only re-runs on stepKey/direction changing.)
    if (stepKey === prevKeyRef.current) return;
    const oldKey = prevKeyRef.current;
    prevKeyRef.current = stepKey;
    const dir = direction;
    const reduced = prefersReducedMotion();

    setSlots((s) => [...s, { key: stepKey, node: children }]);

    requestAnimationFrame(() => {
      const outgoing = elRefs.current.get(oldKey);
      const incoming = elRefs.current.get(stepKey);
      if (reduced || dir === 0) {
        const duration = reduced ? 0 : 360;
        if (outgoing) {
          outgoing
            .animate([{ opacity: 1 }, { opacity: 0 }], { duration, easing: EASE_STANDARD, fill: "forwards" })
            .finished.catch(() => {})
            .finally(() => setSlots((s) => s.filter((slot) => slot.key !== oldKey)));
        } else {
          setSlots((s) => s.filter((slot) => slot.key !== oldKey));
        }
        incoming?.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing: EASE_STANDARD, fill: "backwards" });
        return;
      }
      const width = incoming?.clientWidth || outgoing?.clientWidth || 0;
      if (outgoing) {
        outgoing
          .animate([{ transform: "translateX(0)" }, { transform: `translateX(${-dir * width}px)` }], {
            duration: 600,
            easing: EASE_STANDARD,
            fill: "forwards",
          })
          .finished.catch(() => {})
          .finally(() => setSlots((s) => s.filter((slot) => slot.key !== oldKey)));
      } else {
        setSlots((s) => s.filter((slot) => slot.key !== oldKey));
      }
      incoming?.animate([{ transform: `translateX(${dir * width}px)` }, { transform: "translateX(0)" }], {
        duration: 600,
        easing: EASE_STANDARD,
        fill: "backwards",
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey, direction]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      {slots.map((slot) => (
        <div
          key={slot.key}
          ref={(el) => {
            if (el) elRefs.current.set(slot.key, el);
            else elRefs.current.delete(slot.key);
          }}
          style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          {/* The current slot always renders the live `children` prop, not
              its stored `node` — a stepping transition freezes an outgoing
              slot's content on purpose, but the current slot must reflect
              prop changes (e.g. a fit-mode toggle) immediately, without
              waiting for the next stepKey change to refresh it. */}
          {slot.key === stepKey ? children : slot.node}
        </div>
      ))}
    </div>
  );
}
