// Verdict derivation for the planning view — see
// design_handoff_sunrise_calendar/PLANNING.md §Verdicts. Pure functions only
// (no DB/network) so this is safe to import from both server code (deriving
// the stored verdict) and client components (looking up a tone's colour).

export type VerdictWord = "Promising" | "Good" | "Bare" | "Socked in" | "Wet";

export interface VerdictTone {
  tone: 1 | 2 | 3 | 4 | 5;
  /** For use on the cream (light) ground. */
  fill: string;
  /** For use on the planning view's near-black ground — what this screen actually uses. */
  dark: string;
}

const TONES: Record<VerdictWord, VerdictTone> = {
  Promising: { tone: 5, fill: "#c67139", dark: "#e0954f" },
  Good: { tone: 4, fill: "#728157", dark: "#a8b884" },
  Bare: { tone: 3, fill: "#a19786", dark: "rgba(245,234,216,.7)" },
  "Socked in": { tone: 2, fill: "#c0b6a5", dark: "rgba(245,234,216,.5)" },
  Wet: { tone: 1, fill: "#c0b6a5", dark: "rgba(245,234,216,.5)" },
};

export function toneFor(word: VerdictWord): VerdictTone {
  return TONES[word];
}

export interface VerdictInput {
  cloudTotal: number; // %
  cloudLow: number; // %
  cloudMid: number; // %
  cloudHigh: number; // %
  precipProbability: number; // %
  fogProbability: number; // %
  ceilingFt: number | null;
}

/** "horizon clear" / "mostly mid/high" proxy: little low cloud in the mix. */
function lowCloudMinority(input: VerdictInput, ceiling: number): boolean {
  return input.cloudLow <= ceiling;
}

export function deriveVerdict(input: VerdictInput): { word: VerdictWord; score: number } {
  // Resolution order per PLANNING.md: Wet wins over everything, then Socked
  // in, then the cloud bands — a colourful-looking day that's also raining
  // is Wet, not Promising.
  if (input.precipProbability >= 50) return { word: "Wet", score: TONES.Wet.tone };

  if (input.fogProbability >= 60 || input.cloudLow >= 80 || input.cloudTotal > 80) {
    return { word: "Socked in", score: TONES["Socked in"].tone };
  }

  if (input.cloudTotal < 20) return { word: "Bare", score: TONES.Bare.tone };

  if (
    input.cloudTotal >= 30 &&
    input.cloudTotal <= 70 &&
    lowCloudMinority(input, 25) &&
    input.precipProbability < 20
  ) {
    return { word: "Promising", score: TONES.Promising.tone };
  }

  return { word: "Good", score: TONES.Good.tone };
}

function dominantBandLabel(input: VerdictInput): "High" | "Mid" {
  return input.cloudHigh >= input.cloudMid ? "High" : "Mid";
}

function round(n: number): number {
  return Math.round(n);
}

/**
 * One or two sentences, written from the same inputs, in the app's voice:
 * plain, specific, never hedged, never gamified. Template-keyed on the
 * deciding factor, not open-ended generation — the voice matters more than
 * the variety.
 */
export function buildReason(word: VerdictWord, input: VerdictInput): string {
  switch (word) {
    case "Wet":
      return input.precipProbability >= 70
        ? "Rain through the morning. Sleep in."
        : `Showers likely, ${round(input.precipProbability)}% chance. Sleep in.`;
    case "Socked in":
      if (input.ceilingFt != null && (input.fogProbability >= 60 || input.cloudLow >= 80)) {
        return `Marine layer to ${round(input.ceilingFt).toLocaleString("en-US")} ft. Above it if you go high, grey if you don't.`;
      }
      if (input.fogProbability >= 60) {
        return `Fog likely, ${round(input.fogProbability)}% chance. Grey start, may burn off late.`;
      }
      return `${round(input.cloudLow)}% low cloud — a solid grey lid. Little chance of colour.`;
    case "Bare":
      return input.cloudTotal < 8
        ? "Empty sky. Little colour, but clean silhouettes."
        : `Mostly clear, ${round(input.cloudTotal)}% cloud. Little colour, but clean silhouettes.`;
    case "Good":
      return `Scattered ${dominantBandLabel(input).toLowerCase()} cloud, warm morning.`;
    case "Promising":
      return `${dominantBandLabel(input)} cloud at ${round(input.cloudTotal)}% — the kind that lights up. Clear at the horizon.`;
  }
}

const COMPASS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];
export function windDirLabel(degrees: number): string {
  const idx = Math.round((degrees % 360) / 22.5) % 16;
  return COMPASS[idx];
}

export function fogLevelLabel(fogProbability: number): string {
  if (fogProbability >= 60) return "High";
  if (fogProbability >= 25) return "Mid";
  return "Low";
}

/** "90% low cloud" — always names the level, since 45% high and 45% low are opposite news. */
export function cloudLabel(input: VerdictInput): string {
  const bands: [string, number][] = [
    ["low", input.cloudLow],
    ["mid", input.cloudMid],
    ["high", input.cloudHigh],
  ];
  const [level] = bands.reduce((a, b) => (b[1] > a[1] ? b : a));
  if (input.cloudTotal < 8) return "clear";
  return `${round(input.cloudTotal)}% ${level} cloud`;
}
