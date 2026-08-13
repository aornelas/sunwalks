"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { EASE_SOFT, prefersReducedMotion } from "@/lib/motion";

interface RollState {
  from: number;
  to: number;
}

interface RollingNumberProps {
  value: number;
  /** Only a sync that brought something new plays the roll — never first load. */
  animate?: boolean;
  className?: string;
}

/**
 * Motion 8 ("stats tick up"): a column of integers rolls past, one row per
 * step, 1120ms soft — capped at six steps, beyond which the value is just
 * set directly.
 */
export function RollingNumber({ value, animate, className }: RollingNumberProps) {
  const [rolling, setRolling] = useState<RollState | null>(null);
  const prevRef = useRef(value);
  const mountedRef = useRef(false);
  const stackRef = useRef<HTMLSpanElement>(null);
  const trackRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      prevRef.current = value;
      return;
    }
    const from = prevRef.current;
    prevRef.current = value;
    if (from === value) return;
    const steps = Math.abs(value - from);
    if (!animate || prefersReducedMotion() || steps === 0 || steps > 6) return;
    setRolling({ from, to: value });
  }, [value, animate]);

  useLayoutEffect(() => {
    if (!rolling) return;
    const stack = stackRef.current;
    const track = trackRef.current;
    if (!stack || !track) {
      setRolling(null);
      return;
    }
    const rowHeight = track.clientHeight;
    const steps = Math.abs(rolling.to - rolling.from);
    const dir = rolling.to > rolling.from ? 1 : -1;
    stack
      .animate([{ transform: "translateY(0)" }, { transform: `translateY(${-dir * steps * rowHeight}px)` }], {
        duration: 1120,
        easing: EASE_SOFT,
        fill: "forwards",
      })
      .finished.catch(() => {})
      .finally(() => setRolling(null));
  }, [rolling]);

  if (!rolling) return <span className={className}>{value}</span>;

  const dir = rolling.to > rolling.from ? 1 : -1;
  const seq = Array.from({ length: Math.abs(rolling.to - rolling.from) + 1 }, (_, i) => rolling.from + i * dir);

  return (
    <span
      ref={trackRef}
      className={className}
      style={{ display: "inline-block", overflow: "hidden", verticalAlign: "bottom", height: "1em", lineHeight: 1 }}
    >
      <span ref={stackRef} style={{ display: "block" }}>
        {seq.map((n) => (
          <span key={n} style={{ display: "block", height: "1em", lineHeight: 1 }}>
            {n}
          </span>
        ))}
      </span>
    </span>
  );
}
