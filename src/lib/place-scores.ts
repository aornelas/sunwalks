// Which spots have worked for which skies: each logged walk is scored from
// the owner's rating and the photos' drama, then averaged per spot and
// observed sky. A spot with few walks leans on a prior from its kind (the
// README's defaults: high places for colour, forest for fog, a short walk
// for a clear sky, bed for rain), so a new spot can still be recommended
// and a lucky single walk can't dominate.

import type { MorningRecord } from "./mornings";
import { CATEGORY_ORDER, type VerdictWord } from "./verdict";

export type SpotKind = "vantage" | "forest" | "short_walk" | "waterfront";

/** The pseudo-spot for mornings in bed. Logged as `stayedIn`, scored like any spot. */
export const STAY_IN = "Stay in";

/**
 * Starting score (0–1) for a kind of spot under each sky, before any walks
 * are logged there. Capped at 0.75 so a spot with a few genuinely great
 * mornings can outrank an untried one that merely suits the sky on paper.
 */
const KIND_PRIORS: Record<SpotKind | "stay_in", Record<VerdictWord, number>> = {
  vantage: { Stunning: 0.75, Nice: 0.65, Clear: 0.45, Foggy: 0.35, Wet: 0.1 },
  waterfront: { Stunning: 0.65, Nice: 0.6, Clear: 0.5, Foggy: 0.35, Wet: 0.1 },
  short_walk: { Stunning: 0.5, Nice: 0.5, Clear: 0.65, Foggy: 0.35, Wet: 0.15 },
  forest: { Stunning: 0.4, Nice: 0.45, Clear: 0.45, Foggy: 0.75, Wet: 0.25 },
  stay_in: { Stunning: 0.05, Nice: 0.1, Clear: 0.15, Foggy: 0.2, Wet: 0.75 },
};

/** How many walks' worth of weight the prior carries. */
const PRIOR_WEIGHT = 1;

/**
 * 0–1 for one morning: the rating ((r−1)/4) and the drama ((d−1)/9),
 * averaged when both exist. Null when there's neither, which happens for a
 * walk with no rating and no tagged photo.
 */
export function walkScore(m: Pick<MorningRecord, "rating" | "drama" | "stayedIn">): number | null {
  const parts: number[] = [];
  if (m.rating != null) parts.push((m.rating - 1) / 4);
  // Staying in has no photo to judge, only how it felt.
  if (m.drama != null && !m.stayedIn) parts.push((m.drama - 1) / 9);
  return parts.length > 0 ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
}

export interface SpotSkyScore {
  walks: number;
  /** Mean walk score, shrunk towards the kind's prior. */
  score: number;
}

export interface SpotScores {
  spot: string;
  kind: SpotKind | "stay_in";
  bySky: Record<VerdictWord, SpotSkyScore>;
  totalWalks: number;
}

export function computeSpotScores(
  spotList: { name: string; kind: SpotKind }[],
  mornings: MorningRecord[],
): SpotScores[] {
  const all = [...spotList.map((s) => ({ name: s.name, kind: s.kind as SpotKind | "stay_in" })), { name: STAY_IN, kind: "stay_in" as const }];
  return all.map(({ name, kind }) => {
    const prior = KIND_PRIORS[kind];
    const visits = mornings.filter((m) => (kind === "stay_in" ? m.stayedIn : m.spot === name));
    const bySky = Object.fromEntries(
      CATEGORY_ORDER.map((sky) => {
        // A walk is filed under the sky its photo shows. A morning with no
        // tagged photo (staying in, or a walk without one) falls back to
        // the sky the forecast promised.
        const scores = visits
          .filter((m) => (m.stayedIn ? m.forecast : (m.observed ?? m.forecast)) === sky)
          .map(walkScore)
          .filter((s): s is number => s != null);
        const sum = scores.reduce((a, b) => a + b, 0);
        return [sky, { walks: scores.length, score: (sum + prior[sky] * PRIOR_WEIGHT) / (scores.length + PRIOR_WEIGHT) }];
      }),
    ) as Record<VerdictWord, SpotSkyScore>;
    return { spot: name, kind, bySky, totalWalks: visits.length };
  });
}

export interface RankedSpot {
  spot: string;
  kind: SpotKind | "stay_in";
  /** Expected score across the skies tomorrow might bring, weighted by how often the forecast holds. */
  expected: number;
  /** Walks logged here under the forecast sky. */
  walksUnderSky: number;
  totalWalks: number;
}

/** Spots ranked for a forecast, given P(observed | forecast) from calibration. */
export function rankSpots(scores: SpotScores[], skyOdds: Record<VerdictWord, number>, forecast: VerdictWord): RankedSpot[] {
  return scores
    .map((s) => ({
      spot: s.spot,
      kind: s.kind,
      expected: CATEGORY_ORDER.reduce((sum, sky) => sum + skyOdds[sky] * s.bySky[sky].score, 0),
      walksUnderSky: s.bySky[forecast].walks,
      totalWalks: s.totalWalks,
    }))
    .sort((a, b) => b.expected - a.expected);
}
