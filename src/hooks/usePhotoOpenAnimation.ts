"use client";

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";
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
 *
 * `enteredRef`, if passed, must be a ref owned by a component ABOVE the one
 * that picks PhotoView vs WebPhotoView vs LandscapePhotoView — rotating the
 * phone swaps between those three, which unmounts one and mounts another,
 * and this hook's own state doesn't survive that (it belongs to the
 * unmounted instance). Without this, every rotation replayed the entire
 * entrance from the calendar square, since the fresh instance has no way to
 * know it isn't a genuinely new open. The owning component resets this ref
 * to false only on a real open and leaves it alone across a same-session
 * remount, so this hook can tell the difference and skip straight to the
 * resting state instead.
 */

/**
 * TEMPORARY DEBUG — remove once the reported ghost (a larger, cropped copy
 * growing behind the real photo on open, on a device this can't be
 * reproduced on) is diagnosed. Appends a small on-screen panel straight to
 * document.body — not through React, so it survives whatever's going wrong
 * with the animated elements themselves — with the numbers behind this
 * open, then samples the actual rendered state of stage/thumb at a few
 * points through the animation. Meant to be screenshotted: the person
 * reproducing this doesn't have devtools open on the device that shows it.
 * Tap the panel to dismiss it early; it also self-removes after 20s.
 */
function debugPhotoOpen(info: {
  origin: PhotoOrigin;
  target: DOMRect;
  dx: number;
  dy: number;
  sx: number;
  sy: number;
  stage: HTMLDivElement;
  thumb: HTMLDivElement | null;
  stageAnimCount: number;
}) {
  if (typeof document === "undefined") return;
  const { origin, target, dx, dy, sx, sy, stage, thumb, stageAnimCount } = info;

  const box = document.createElement("pre");
  box.style.cssText =
    "position:fixed;left:4px;right:4px;bottom:4px;z-index:2147483647;background:rgba(0,0,0,.92);" +
    "color:#7CFC00;font:10px/1.4 -apple-system,monospace;padding:8px;border-radius:8px;" +
    "white-space:pre-wrap;word-break:break-all;max-height:50vh;overflow:auto;margin:0;";
  const lines: string[] = [];
  const render = () => {
    box.textContent = lines.join("\n");
  };

  lines.push("PHOTO-OPEN DEBUG — tap to dismiss");
  lines.push(`UA: ${navigator.userAgent}`);
  lines.push(`origin.rect: ${JSON.stringify(origin.rect)}`);
  lines.push(
    `target: L${target.left.toFixed(1)} T${target.top.toFixed(1)} W${target.width.toFixed(1)} H${target.height.toFixed(1)}`,
  );
  lines.push(`dx=${dx.toFixed(1)} dy=${dy.toFixed(1)} sx=${sx.toFixed(3)} sy=${sy.toFixed(3)}`);
  lines.push(`stage anims created: ${stageAnimCount}`);
  lines.push(thumb ? `thumb bg-size: ${getComputedStyle(thumb).backgroundSize}` : "thumb: null (no thumbRef element)");
  // How many elements sharing thumb's class exist anywhere in the document
  // — should always be 1. More than that means something (an unrelated
  // photo view instance, a leftover from a prior open) is still mounted.
  if (thumb) {
    const dupeCount = document.getElementsByClassName(thumb.className.split(" ")[0]).length;
    lines.push(`elements sharing thumb's own class anywhere in DOM: ${dupeCount}`);
  }
  render();
  box.addEventListener("click", () => box.remove());
  document.body.appendChild(box);

  const sample = (label: string) => {
    const related = document.getAnimations().filter((a) => {
      const target = (a.effect as KeyframeEffect | null)?.target;
      return target === stage || target === thumb;
    });
    const running = related.filter((a) => a.playState === "running").length;
    lines.push(`[${label}] anims on stage/thumb: ${running} running / ${related.length} total`);
    lines.push(`[${label}] stage transform: ${getComputedStyle(stage).transform}`);
    if (thumb) {
      lines.push(`[${label}] thumb transform: ${getComputedStyle(thumb).transform} opacity: ${getComputedStyle(thumb).opacity}`);
    }
    // How many <img> tags actually exist inside .stage right now, and where
    // each one is painted — if SteppingPhoto is leaving more than one slot
    // mounted, or a stray extra image, this is where it'd show up.
    const imgs = Array.from(stage.querySelectorAll("img"));
    lines.push(`[${label}] <img> count inside stage: ${imgs.length}`);
    imgs.forEach((img, i) => {
      const r = img.getBoundingClientRect();
      lines.push(
        `[${label}]   img#${i}: src=...${img.currentSrc.slice(-40)} rect=${r.width.toFixed(0)}x${r.height.toFixed(0)}@${r.left.toFixed(0)},${r.top.toFixed(0)} opacity=${getComputedStyle(img).opacity} objectFit=${getComputedStyle(img).objectFit}`,
      );
    });
    // SteppingPhoto's own wrapper is stage's first child; each of ITS
    // children is one "slot" — more than one after landing means an
    // outgoing slot never got cleaned up.
    const steppingWrapper = stage.firstElementChild;
    const slotCount = steppingWrapper?.children.length ?? -1;
    lines.push(`[${label}] SteppingPhoto slot count: ${slotCount}`);
    render();
  };
  sample("t=0ms");
  setTimeout(() => sample("t=100ms"), 100);
  setTimeout(() => sample("t=400ms"), 400);
  setTimeout(() => sample("t=900ms landed"), 900);
  setTimeout(() => sample("t=1400ms thumb should be gone"), 1400);
  setTimeout(() => {
    if (box.isConnected) box.remove();
  }, 20000);
}

export function usePhotoOpenAnimation(origin: PhotoOrigin | null, enteredRef?: RefObject<boolean>) {
  const stageRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  // Exposed (rather than left for callers to read enteredRef.current
  // themselves) so the read only ever happens here, inside this same
  // effect — the one place that might also write it. Reading it anywhere
  // else risks a render happening before this effect has run, or, if done
  // from another effect, an ordering race against this one for which
  // reads/writes first.
  const [skipEntrance, setSkipEntrance] = useState(false);

  useLayoutEffect(() => {
    if (enteredRef?.current) {
      // reorientation remount, not a fresh open — render at rest, no replay
      setSkipEntrance(true);
      return;
    }
    if (enteredRef) enteredRef.current = true;
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
      // TEMPORARY DEBUG — remove once the WebKit ghost is diagnosed. See
      // debugPhotoOpen below; this is the only call site with the numbers
      // (dx/dy/sx/sy, target rect) needed to make sense of what's rendering.
      debugPhotoOpen({ origin, target, dx, dy, sx, sy, stage, thumb, stageAnimCount: anims.length });
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

  return { stageRef, thumbRef, scrimRef, closing, requestClose, skipEntrance };
}
