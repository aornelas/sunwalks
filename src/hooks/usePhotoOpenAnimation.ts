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
 *
 * `thumbRef` goes on the thumbnail underlay — it must be a *sibling* of the
 * stage, not nested inside it. Nesting it and relying on it inheriting the
 * stage's WAAPI transform looked correct (and is, per the CSS transform
 * spec) but broke on WebKit: a child that also carries its own separate CSS
 * `animation` (the thumbnail's opacity fade-out) doesn't reliably composite
 * under an ancestor's JS-driven transform on that engine, so it rendered at
 * full, untransformed size for the whole scale-up — a duplicate "ghost"
 * photo sitting behind the real one. Driving both elements independently
 * with the identical keyframes sidesteps that compositing question
 * entirely instead of depending on it.
 */
export function usePhotoOpenAnimation(origin: PhotoOrigin | null) {
  const stageRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const thumb = thumbRef.current;
    const reduced = prefersReducedMotion();
    const scrimAnim = scrimRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: reduced ? 240 : 480,
      fill: "backwards",
    });
    // Cancel on cleanup so a double-invoke (React Strict Mode in dev, or any
    // other re-run) can't leave two `.animate()` calls stacked on the same
    // element. The second call would measure `stage` AFTER the first one's
    // fill:"backwards" had already shrunk it, computing near-identity deltas
    // that — being the most recently created effect — win the composite and
    // silently swallow the real scale-up, leaving the stage sitting at full
    // size for the whole "animation."
    if (!stage) return () => scrimAnim?.cancel();
    if (reduced) {
      // "Motion 2 becomes a plain fade — no scale, no travel."
      const stageAnim = stage.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, fill: "backwards" });
      return () => {
        scrimAnim?.cancel();
        stageAnim.cancel();
      };
    }
    const anims: Animation[] = [];
    if (origin) {
      const target = stage.getBoundingClientRect();
      const dx = origin.rect.left - target.left;
      const dy = origin.rect.top - target.top;
      const sx = origin.rect.width / Math.max(target.width, 1);
      const sy = origin.rect.height / Math.max(target.height, 1);
      const keyframes: Keyframe[] = [
        { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
        { transform: "none" },
      ];
      const timing: KeyframeAnimationOptions = { duration: 760, easing: EASE_STANDARD, fill: "backwards" };
      anims.push(stage.animate(keyframes, timing));
      if (thumb) anims.push(thumb.animate(keyframes, timing));
    } else {
      anims.push(
        stage.animate([{ opacity: 0, transform: "scale(.97)" }, { opacity: 1, transform: "none" }], {
          duration: 480,
          easing: EASE_STANDARD,
          fill: "backwards",
        }),
      );
    }
    return () => {
      scrimAnim?.cancel();
      anims.forEach((a) => a.cancel());
    };
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
        // The thumbnail underlay has already finished its one-time fade-out
        // by the time a close is possible, so only the stage needs to play
        // the reverse here — nothing to keep in sync on the thumb.
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

  return { stageRef, thumbRef, scrimRef, closing, requestClose };
}
