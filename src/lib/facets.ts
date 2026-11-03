// The calendar's sky and place filters. A day matches when at least one of
// its shots does, and a matching day shows as it always does: its own day
// photo and all its shots, so a filter never swaps in another photo from
// that morning. Days with no match read as empty, which the "sunwalk days
// only" toggle then hides.

import { CATEGORY_ORDER, type VerdictWord } from "./verdict";
import type { DayData } from "./types";

export { CATEGORY_ORDER };

export interface Facet {
  category: VerdictWord | null;
  place: string | null;
}

export const NO_FACET: Facet = { category: null, place: null };

export function isFacetActive(facet: Facet): boolean {
  return facet.category !== null || facet.place !== null;
}

/**
 * Wraps a getDay lookup with the facet applied: matching days come back
 * as the same DayData object, so memoised children don't re-render.
 */
export function withFacet(
  getDay: (date: string) => DayData | undefined,
  facet: Facet,
): (date: string) => DayData | undefined {
  if (!isFacetActive(facet)) return getDay;
  return (date) => {
    const day = getDay(date);
    const matches = day?.shots.some(
      (s) => (!facet.category || s.category === facet.category) && (!facet.place || s.place === facet.place),
    );
    return matches ? day : undefined;
  };
}
