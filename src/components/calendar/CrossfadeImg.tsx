"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { EASE_STANDARD, prefersReducedMotion } from "@/lib/motion";

interface Layer {
  key: string;
  src: string;
  srcSet: string;
}

interface CrossfadeImgProps {
  src: string;
  srcSet: string;
  alt: string;
  sizes?: string;
  loading?: "lazy" | "eager";
  fetchPriority?: "high" | "low" | "auto";
}

/**
 * Motion 6: "the calendar square cross-dissolves between old and new photo
 * over 520ms standard" — used wherever a day's photo can change under a
 * still-mounted grid cell (setting a different shot as the day photo).
 * Requires a `position: relative` ancestor to anchor into.
 */
export function CrossfadeImg({ src, srcSet, alt, sizes, loading, fetchPriority }: CrossfadeImgProps) {
  const [layers, setLayers] = useState<Layer[]>([{ key: src, src, srcSet }]);
  const prevSrcRef = useRef(src);
  const elRefs = useRef(new Map<string, HTMLImageElement>());

  useLayoutEffect(() => {
    if (src === prevSrcRef.current) return;
    const oldKey = prevSrcRef.current;
    prevSrcRef.current = src;
    const duration = prefersReducedMotion() ? 0 : 520;

    setLayers((l) => [...l, { key: src, src, srcSet }]);

    requestAnimationFrame(() => {
      const outgoing = elRefs.current.get(oldKey);
      const incoming = elRefs.current.get(src);
      if (outgoing) {
        outgoing
          .animate([{ opacity: 1 }, { opacity: 0 }], { duration, easing: EASE_STANDARD, fill: "forwards" })
          .finished.catch(() => {})
          .finally(() => setLayers((l) => l.filter((x) => x.key !== oldKey)));
      } else {
        setLayers((l) => l.filter((x) => x.key !== oldKey));
      }
      incoming?.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing: EASE_STANDARD, fill: "backwards" });
    });
  }, [src, srcSet]);

  return (
    <>
      {layers.map((l) => (
        <img
          key={l.key}
          ref={(el) => {
            if (el) elRefs.current.set(l.key, el);
            else elRefs.current.delete(l.key);
          }}
          src={l.src}
          srcSet={l.srcSet}
          alt={alt}
          sizes={sizes}
          loading={loading}
          fetchPriority={fetchPriority}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      ))}
    </>
  );
}
