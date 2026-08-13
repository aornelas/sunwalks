// Shared motion utilities — see design_handoff_sunrise_calendar/MOTION.md.
// CSS-driven motions blend against the --motion-scale custom property
// directly in calc(); the handful of motions that need the Web Animations
// API for interruptibility (shared-element open, the viewing ring, day
// stepping) read the same reduced-motion signal here in JS.

import { useLayoutEffect, useState } from "react";

let firstPaintConsumed = false;

// SSR is stateless per request, but this module stays loaded (and this
// `let` keeps its value) across requests on a long-lived Node server —
// so the server side must never actually consult or mutate the flag, only
// pretend it's always unconsumed. Otherwise which request happens to run
// first decides every later request's markup, and whatever the server
// rendered would mismatch the client's own fresh-module state on hydration.
function firstPaintAvailable(): boolean {
  return typeof window === "undefined" ? true : !firstPaintConsumed;
}

function markFirstPaintConsumed(): void {
  if (typeof window !== "undefined") firstPaintConsumed = true;
}

/**
 * Motion 1 ("calendar settles in") plays once, on the very first paint of
 * the app — never on a zoom switch, filter, or return from the photo view.
 * Zoom views unmount/remount on every zoom switch, so "once" can't live in
 * that component's own state; a module-level flag survives the remount for
 * the lifetime of the page and naturally resets on a real reload. Reading
 * the flag happens in the lazy initializer (pure, safe under Strict Mode's
 * double-invoke); consuming it is deferred to a layout effect, since a
 * side effect — mutation — has no business happening during render.
 */
export function useFirstPaintEntrance(): boolean {
  const [playEntrance] = useState(firstPaintAvailable);
  useLayoutEffect(() => {
    if (playEntrance) markFirstPaintConsumed();
  }, [playEntrance]);
  return playEntrance;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Scales a spec duration (ms) by the reduced-motion switch. */
export function motionDuration(ms: number): number {
  return prefersReducedMotion() ? 0 : ms;
}

export const EASE_STANDARD = "cubic-bezier(.2, 0, 0, 1)";
export const EASE_SOFT = "cubic-bezier(.34, .9, .3, 1)";
export const EASE_EXIT = "cubic-bezier(.4, 0, 1, 1)";

/**
 * FLIP: capture "First" rects before a layout-affecting change, then call
 * `play` after the DOM has updated to invert each element from its old
 * position to its new one and animate to identity. Returns the Animations
 * so callers can await `.finished` or cancel on interruption.
 */
export function flipPlay(
  el: HTMLElement,
  first: DOMRect,
  options: { duration: number; easing: string },
): Animation | null {
  const last = el.getBoundingClientRect();
  const dx = first.left - last.left;
  const dy = first.top - last.top;
  const sx = first.width / Math.max(last.width, 1);
  const sy = first.height / Math.max(last.height, 1);
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) {
    return null;
  }
  return el.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
      { transform: "none" },
    ],
    { duration: options.duration, easing: options.easing, fill: "backwards" },
  );
}
