// The calendar's sky and place filters. A day matches when at least one of
// its shots does; the matching shots are all the calendar then shows for
// it, so the thumbnail is a Foggy shot when filtering by Foggy. Days with
// no match read as empty, which the "sunwalk days only" toggle then hides.

import type { VerdictWord } from "./verdict";
import type { DayData } from "./types";

export const CATEGORY_ORDER: VerdictWord[] = ["Stunning", "Nice", "Clear", "Foggy", "Wet"];

export interface Facet {
  category: VerdictWord | null;
  place: string | null;
}

export const NO_FACET: Facet = { category: null, place: null };

export function isFacetActive(facet: Facet): boolean {
  return facet.category !== null || facet.place !== null;
}

/**
 * Wraps a getDay lookup with the facet applied. Results are memoised per
 * source DayData object, so every lookup of an unchanged day returns the
 * same object and memoised children don't re-render.
 */
export function withFacet(
  getDay: (date: string) => DayData | undefined,
  facet: Facet,
): (date: string) => DayData | undefined {
  if (!isFacetActive(facet)) return getDay;
  const memo = new WeakMap<DayData, DayData | undefined>();
  return (date) => {
    const day = getDay(date);
    if (!day) return undefined;
    if (memo.has(day)) return memo.get(day);
    const shots = day.shots.filter(
      (s) => (!facet.category || s.category === facet.category) && (!facet.place || s.place === facet.place),
    );
    let filtered: DayData | undefined;
    if (shots.length === day.shots.length) filtered = day;
    else if (shots.length > 0) {
      const dayShotId = shots.some((s) => s.id === day.dayShotId) ? day.dayShotId : shots[0].id;
      filtered = { ...day, shots, dayShotId };
    }
    memo.set(day, filtered);
    return filtered;
  };
}
