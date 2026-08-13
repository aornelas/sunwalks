"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { EASE_SOFT, prefersReducedMotion } from "@/lib/motion";

interface ViewingRingProps {
  className?: string;
  containerRef: RefObject<HTMLDivElement | null>;
  thumbRefs: RefObject<Map<string, HTMLElement>>;
  activeKey: string | undefined;
}

/**
 * Motion 6 ("choosing the day's photo"): the ring translates between
 * thumbnails rather than blinking, traveling exactly one thumbnail pitch
 * and landing flush — soft easing settles here, it never overshoots.
 */
export function ViewingRing({ className, containerRef, thumbRefs, activeKey }: ViewingRingProps) {
  const ringRef = useRef<HTMLSpanElement>(null);
  const lastRef = useRef<{ left: number; top: number; width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const ring = ringRef.current;
    const container = containerRef.current;
    const target = activeKey ? thumbRefs.current?.get(activeKey) : undefined;
    if (!ring || !container || !target) {
      if (ring) ring.style.opacity = "0";
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const next = {
      left: targetRect.left - containerRect.left,
      top: targetRect.top - containerRect.top,
      width: targetRect.width,
      height: targetRect.height,
    };
    ring.style.opacity = "1";
    const prev = lastRef.current;
    if (!prev || prefersReducedMotion()) {
      ring.style.transform = `translate(${next.left}px, ${next.top}px)`;
      ring.style.width = `${next.width}px`;
      ring.style.height = `${next.height}px`;
    } else {
      ring.animate(
        [
          { transform: `translate(${prev.left}px, ${prev.top}px)`, width: `${prev.width}px`, height: `${prev.height}px` },
          { transform: `translate(${next.left}px, ${next.top}px)`, width: `${next.width}px`, height: `${next.height}px` },
        ],
        { duration: 440, easing: EASE_SOFT, fill: "forwards" },
      );
      ring.style.transform = `translate(${next.left}px, ${next.top}px)`;
      ring.style.width = `${next.width}px`;
      ring.style.height = `${next.height}px`;
    }
    lastRef.current = next;
  }, [activeKey, containerRef, thumbRefs]);

  return (
    <span
      ref={ringRef}
      className={className}
      style={{ position: "absolute", top: 0, left: 0, opacity: 0, pointerEvents: "none" }}
    />
  );
}
