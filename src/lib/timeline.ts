// The planning view's light-window timeline — see PLANNING.md
// §Light-window timeline. Pure functions, safe for client and server.

/** Minutes since local midnight, in `timezone`, for a UTC instant. */
export function localMinutesOfDay(instant: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const hour = Number(parts.find((p) => p.type === "hour")!.value) % 24;
  const minute = Number(parts.find((p) => p.type === "minute")!.value);
  return hour * 60 + minute;
}

/**
 * A fixed two-hour window, drawn once per batch and never rescaled per day
 * — the point is that the marks *move* a little between days rather than
 * the bar re-fitting itself. Snapped to the half hour, sized so a typical
 * sunrise sits comfortably inside with room for first light before it; this
 * naturally reproduces both examples in the spec (sunrise 6:24 AM →
 * 5:30–7:30; December's later sunrise → ~6:30–8:30).
 */
export function computeTimelineWindow(
  sunriseUtc: Date,
  timezone: string,
): { startMinutes: number; endMinutes: number } {
  const sunriseMinutes = localMinutesOfDay(sunriseUtc, timezone);
  const start = Math.max(0, Math.floor((sunriseMinutes - 54) / 30) * 30);
  return { startMinutes: start, endMinutes: start + 120 };
}

/** Left-offset percentage for a mark at `instant` within [startMinutes, endMinutes). */
export function tickLeftPercent(instant: Date, timezone: string, startMinutes: number): number {
  const minutes = localMinutesOfDay(instant, timezone);
  return ((minutes - startMinutes) / 120) * 100;
}
