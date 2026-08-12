"use client";

import { useSyncExternalStore } from "react";

// A rotated phone is constrained by HEIGHT, not width (874×402, not the
// other way round) — width-based checks never match a landscape phone.
const QUERY = "(orientation: landscape) and (max-height: 500px)";

function subscribe(callback: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

/**
 * True only for a rotated phone. Desktop/tablet windows never count as
 * "landscape" here — the calendar itself is portrait-locked; only a phone's
 * photo view responds to physical rotation.
 */
export function useLandscapePhoto(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
