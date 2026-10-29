// How often each forecast category came true: the forecast made for a
// morning against the sky the photo actually showed. Plain counting, no
// model calls, so it's cheap, testable and explainable. Its output feeds
// the recommender's confidence and the calibration report (the backtest).

import type { MorningRecord } from "./mornings";
import { CATEGORY_ORDER, type VerdictWord } from "./verdict";

/** Below this many mornings a held-rate is reported but not trusted. */
export const MIN_SAMPLE = 3;

export interface CategoryCalibration {
  category: VerdictWord;
  /** Mornings forecast as this category that have an observed sky. */
  forecasts: number;
  held: number;
  /** held / forecasts, or null with no forecasts. */
  heldRate: number | null;
  /** Laplace-smoothed (held + 1) / (forecasts + 2): 0.5 with no evidence, moving towards the raw rate as mornings accumulate. */
  confidence: number;
  /** What the sky turned out to be instead, most common first. */
  turnedOut: { category: VerdictWord; count: number }[];
}

export interface Calibration {
  /** confusion[forecast][observed] = count. */
  confusion: Record<VerdictWord, Record<VerdictWord, number>>;
  byCategory: CategoryCalibration[];
  compared: number;
  held: number;
  sources: { live: number; historical: number };
}

function emptyRow(): Record<VerdictWord, number> {
  return Object.fromEntries(CATEGORY_ORDER.map((c) => [c, 0])) as Record<VerdictWord, number>;
}

export function computeCalibration(mornings: MorningRecord[]): Calibration {
  const confusion = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, emptyRow()])) as Calibration["confusion"];
  const sources = { live: 0, historical: 0 };
  let compared = 0;
  let held = 0;
  for (const m of mornings) {
    if (!m.forecast || !m.observed) continue;
    confusion[m.forecast][m.observed]++;
    compared++;
    if (m.forecast === m.observed) held++;
    if (m.forecastSource) sources[m.forecastSource]++;
  }

  const byCategory = CATEGORY_ORDER.map((category): CategoryCalibration => {
    const row = confusion[category];
    const forecasts = CATEGORY_ORDER.reduce((sum, c) => sum + row[c], 0);
    const hits = row[category];
    return {
      category,
      forecasts,
      held: hits,
      heldRate: forecasts > 0 ? hits / forecasts : null,
      confidence: (hits + 1) / (forecasts + 2),
      turnedOut: CATEGORY_ORDER.filter((c) => c !== category && row[c] > 0)
        .map((c) => ({ category: c, count: row[c] }))
        .sort((a, b) => b.count - a.count),
    };
  });

  return { confusion, byCategory, compared, held, sources };
}

/**
 * P(observed sky | forecast), smoothed towards "the forecast holds" so a
 * category with little history still mostly trusts the forecast. Used to
 * weigh spot scores across the skies tomorrow might actually bring.
 */
export function observedDistribution(calibration: Calibration, forecast: VerdictWord): Record<VerdictWord, number> {
  const row = calibration.confusion[forecast];
  const prior = emptyRow();
  prior[forecast] = 2; // two pseudo-mornings on which the forecast held
  for (const c of CATEGORY_ORDER) prior[c] += 0.2; // and a little mass everywhere else
  const total = CATEGORY_ORDER.reduce((sum, c) => sum + row[c] + prior[c], 0);
  return Object.fromEntries(CATEGORY_ORDER.map((c) => [c, (row[c] + prior[c]) / total])) as Record<VerdictWord, number>;
}

/** "7 of 9 Foggy forecasts held", or a plain statement that there isn't enough history yet. */
export function describeConfidence(c: CategoryCalibration): string {
  if (c.forecasts === 0) return `No ${c.category} forecasts checked against a photo yet`;
  const line = `${c.held} of ${c.forecasts} ${c.category} forecasts held`;
  return c.forecasts < MIN_SAMPLE ? `${line} (too few to go on)` : line;
}
