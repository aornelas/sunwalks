// Whether a spot fits a morning: sunrise, plus the time the owner likes to
// stay, plus any walk there, plus the trip home, has to come before the
// time they need to be back (school drop-off on school days). Plain
// arithmetic, so the recommender never has to guess it.

import { formatTime } from "./dates";

export interface DayRule {
  label: string;
  /** "07:50", owner-local; null when there's no time to be back. */
  backBy: string | null;
  stayMinutes: number;
}

export interface SpotTiming {
  minutesHome: number | null;
  loopMinutes: number;
}

export type ReachStatus = "in_reach" | "too_far" | "unknown";

export interface Reach {
  status: ReachStatus;
  /** When they'd be home, for a spot with known timing. */
  homeAt: Date | null;
  /** Minutes to spare before backBy (negative when late); null with no deadline or unknown timing. */
  spareMinutes: number | null;
  reason: string;
}

const MINUTE = 60_000;

/** Home (staying in) is always in reach. */
export const HOME_TIMING: SpotTiming = { minutesHome: 0, loopMinutes: 0 };

export function reachFor(
  sunrise: Date,
  rule: DayRule,
  backBy: Date | null,
  spot: SpotTiming,
  timeZone: string,
): Reach {
  if (spot === HOME_TIMING) return { status: "in_reach", homeAt: null, spareMinutes: null, reason: "always in reach" };
  if (spot.minutesHome == null) {
    return backBy
      ? { status: "unknown", homeAt: null, spareMinutes: null, reason: "how long it takes to get home from here isn't set" }
      : { status: "in_reach", homeAt: null, spareMinutes: null, reason: `${rule.label}: no time to be back` };
  }
  // Rounded up to the minute, so the time shown and the minutes to spare agree.
  const homeAt = new Date(Math.ceil((sunrise.getTime() + (rule.stayMinutes + spot.loopMinutes + spot.minutesHome) * MINUTE) / MINUTE) * MINUTE);
  if (!backBy) {
    return { status: "in_reach", homeAt, spareMinutes: null, reason: `${rule.label}: no time to be back` };
  }
  const spare = Math.floor((backBy.getTime() - homeAt.getTime()) / MINUTE);
  const home = formatTime(homeAt, timeZone);
  const due = formatTime(backBy, timeZone);
  return spare >= 0
    ? { status: "in_reach", homeAt, spareMinutes: spare, reason: `home by ${home}, ${spare} min before ${due}` }
    : { status: "too_far", homeAt, spareMinutes: spare, reason: `home at ${home}, ${-spare} min after ${due}` };
}
