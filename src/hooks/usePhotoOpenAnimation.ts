"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { EASE_EXIT, EASE_STANDARD, prefersReducedMotion } from "@/lib/motion";
import type { PhotoOrigin } from "@/lib/photo-origin";

/**
 * Motion 2 ("square opens"): the tapped square's rect becomes the
 * transform-origin and scales up to fill the frame; closing reverses back
 * to the same square. `stageRef` goes on the element that should carry the
 * transform (the photo itself, not the whole overlay — swipe-to-dismiss
 * already owns translateY on the overlay, so the two never fight over the
 * same element). Without an origin (e.g. a deep link opened the view
 * directly), the stage just gets a plain settle and the scrim still fades.
 */
export function usePhotoOpenAnimation(origin: PhotoOrigin | null) {
  const stageRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const reduced = prefersReducedMotion();
    scrimRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: reduced ? 240 : 480,
      fill: "backwards",
    });
    if (!stage) return;
    if (reduced) {
      // "Motion 2 becomes a plain fade — no scale, no travel."
      stage.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, fill: "backwards" });
      return;
    }
    if (origin) {
      const target = stage.getBoundingClientRect();
      const dx = origin.rect.left - target.left;
      const dy = origin.rect.top - target.top;
      const sx = origin.rect.width / Math.max(target.width, 1);
      const sy = origin.rect.height / Math.max(target.height, 1);
      stage.animate(
        [{ transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` }, { transform: "none" }],
        { duration: 760, easing: EASE_STANDARD, fill: "backwards" },
      );
    } else {
      stage.animate([{ opacity: 0, transform: "scale(.97)" }, { opacity: 1, transform: "none" }], {
        duration: 480,
        easing: EASE_STANDARD,
        fill: "backwards",
      });
    }
    // Mount-only: this is the entrance, not a response to origin identity
    // changing (origin never changes for the life of one open view).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Plays the reverse (or a plain fade, without an origin) then calls `close`. */
  const requestClose = useCallback(
    (close: () => void) => {
      const stage = stageRef.current;
      const reduced = prefersReducedMotion();
      setClosing(true);
      scrimRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduced ? 240 : 400, fill: "forwards" });
      if (!stage) {
        close();
        return;
      }
      if (reduced) {
        stage.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, fill: "forwards" }).finished
          .catch(() => {})
          .finally(close);
        return;
      }
      let anim: Animation;
      if (origin) {
        const target = stage.getBoundingClientRect();
        const dx = origin.rect.left - target.left;
        const dy = origin.rect.top - target.top;
        const sx = origin.rect.width / Math.max(target.width, 1);
        const sy = origin.rect.height / Math.max(target.height, 1);
        anim = stage.animate(
          [{ transform: "none" }, { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` }],
          { duration: 520, easing: EASE_EXIT, fill: "forwards" },
        );
      } else {
        anim = stage.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.97)" }], {
          duration: 320,
          easing: EASE_EXIT,
          fill: "forwards",
        });
      }
      anim.finished.catch(() => {}).finally(close);
    },
    [origin],
  );

  return { stageRef, scrimRef, closing, requestClose };
}
