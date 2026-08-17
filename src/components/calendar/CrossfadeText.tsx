"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { EASE_STANDARD, prefersReducedMotion } from "@/lib/motion";

interface Layer {
  key: string;
  text: string;
}

interface CrossfadeTextProps {
  text: string;
  className?: string;
  /** Defaults match motion 9's caption (360ms, +120ms delay). Pass 280/0 for the "Copy link" micro-state. */
  duration?: number;
  delay?: number;
  /** Applied to whichever layer is current — the outgoing layer adopts it too, since it's about to fade out anyway. */
  color?: string;
}

/**
 * Motion 9 / micro-states: text that cross-dissolves in place instead of
 * blinking to its new value — the caption during day-stepping, or a label
 * like "Copy link" → "Link copied".
 */
export function CrossfadeText({ text, className, duration: durationProp = 360, delay: delayProp = 120, color }: CrossfadeTextProps) {
  const [layers, setLayers] = useState<Layer[]>([{ key: text, text }]);
  const prevRef = useRef(text);
  const elRefs = useRef(new Map<string, HTMLSpanElement>());

  useLayoutEffect(() => {
    if (text === prevRef.current) return;
    const oldKey = prevRef.current;
    prevRef.current = text;
    const duration = prefersReducedMotion() ? 0 : durationProp;
    const delay = prefersReducedMotion() ? 0 : delayProp;

    setLayers((l) => [...l, { key: text, text }]);
    requestAnimationFrame(() => {
      const outgoing = elRefs.current.get(oldKey);
      const incoming = elRefs.current.get(text);
      if (outgoing) {
        outgoing
          .animate([{ opacity: 1 }, { opacity: 0 }], { duration, delay, easing: EASE_STANDARD, fill: "forwards" })
          .finished.catch(() => {})
          .finally(() => setLayers((l) => l.filter((x) => x.key !== oldKey)));
      } else {
        setLayers((l) => l.filter((x) => x.key !== oldKey));
      }
      incoming?.animate([{ opacity: 0 }, { opacity: 1 }], { duration, delay, easing: EASE_STANDARD, fill: "backwards" });
    });
  }, [text, durationProp, delayProp]);

  return (
    <span className={className} style={{ position: "relative", display: "block" }}>
      {layers.map((l, i) => (
        <span
          key={l.key}
          ref={(el) => {
            if (el) elRefs.current.set(l.key, el);
            else elRefs.current.delete(l.key);
          }}
          // The first (outgoing) layer stays in normal flow so the wrapper
          // keeps sizing itself off real content — if every layer were
          // absolutely positioned at once, the wrapper would have nothing
          // left to size against and collapse to 0×0 for the crossfade's
          // duration (visible as the button snapping tiny, then back).
          style={i > 0 ? { position: "absolute", inset: 0, color } : { color }}
        >
          {l.text}
        </span>
      ))}
    </span>
  );
}
