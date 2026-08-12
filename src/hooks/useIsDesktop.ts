"use client";

import { useSyncExternalStore } from "react";

// `pointer: fine` excludes a rotated phone: the Pixel 10 Pro XL's landscape
// viewport (~998×448) is wider than 900px, which would otherwise misread a
// rotated touch phone as desktop (see ANDROID_UPDATE.md — device profile).
const QUERY = "(min-width: 900px) and (pointer: fine)";

function subscribe(callback: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

/** Defaults to the mobile layout (the primary surface) on the server. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
