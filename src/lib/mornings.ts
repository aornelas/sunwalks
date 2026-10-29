// Everything the engine knows about past mornings, joined by date: what the
// forecast said, what the sky turned out to be (from the photos' tags),
// and where the owner went and how it was. Calibration, place scores and
// the recommender's similar_mornings tool all read from this one shape.

import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { days, forecastSnapshots, photoTags, photos, spots, walks } from "@/db/schema";
import { deriveVerdict, type VerdictWord } from "./verdict";

export interface MorningRecord {
  date: string;
  /** Re-derived from the stored inputs, so a rule change applies to the whole history. */
  forecast: VerdictWord | null;
  forecastSource: "live" | "historical" | null;
  ceilingFt: number | null;
  /** The snapshot the forecast came from, for the recommender's get_forecast on past dates. */
  snapshot: typeof forecastSnapshots.$inferSelect | null;
  /** The sky the day's chosen photo shows (any tagged photo if the day shot isn't tagged). */
  observed: VerdictWord | null;
  /** Mean drama (1–10) across the day's tagged photos. */
  drama: number | null;
  spot: string | null;
  stayedIn: boolean;
  /** The owner said they missed the sunrise. Not the same as no report. */
  sleptIn: boolean;
  rating: number | null;
  note: string | null;
}

/**
 * The evening-before live forecast where there is one, else the historical
 * archive's morning-of forecast. A same-morning live fetch (lead 0) is only
 * used when neither exists, since it was made with the sky in view.
 */
function preferredSnapshot(rows: (typeof forecastSnapshots.$inferSelect)[]) {
  const rank = (r: typeof forecastSnapshots.$inferSelect) => {
    if (r.source === "live" && r.leadDays === 1) return 0;
    if (r.source === "historical") return 1;
    if (r.source === "live" && r.leadDays === 0) return 2;
    return 3; // a live forecast from two or more days out
  };
  return [...rows].sort((a, b) => rank(a) - rank(b))[0];
}

export async function loadMornings(): Promise<MorningRecord[]> {
  const [snapshotRows, tagRows, dayRows, walkRows] = await Promise.all([
    db.select().from(forecastSnapshots),
    db
      .select({ photoId: photoTags.photoId, date: photos.date, category: photoTags.observedCategory, drama: photoTags.drama })
      .from(photoTags)
      .innerJoin(photos, eq(photoTags.photoId, photos.id)),
    db.select().from(days),
    db
      .select({ walk: walks, spotName: spots.name })
      .from(walks)
      .leftJoin(spots, eq(walks.spotId, spots.id))
      .orderBy(asc(walks.date)),
  ]);

  const snapshotsByDate = groupBy(snapshotRows, (r) => r.date);
  const tagsByDate = groupBy(tagRows, (r) => r.date);
  const dayShot = new Map(dayRows.map((d) => [d.date, d.dayShotId]));
  const walkByDate = new Map(walkRows.map((w) => [w.walk.date, w]));

  const dates = new Set([...snapshotsByDate.keys(), ...tagsByDate.keys(), ...walkByDate.keys()]);
  const out: MorningRecord[] = [];
  for (const date of [...dates].sort()) {
    const snapshot = preferredSnapshot(snapshotsByDate.get(date) ?? []);
    const tags = tagsByDate.get(date) ?? [];
    const chosen = tags.find((t) => t.photoId === dayShot.get(date)) ?? tags[0];
    const walk = walkByDate.get(date);
    out.push({
      date,
      forecast: snapshot ? deriveVerdict(snapshot).word : null,
      forecastSource: snapshot?.source ?? null,
      ceilingFt: snapshot?.ceilingFt ?? null,
      snapshot: snapshot ?? null,
      observed: (chosen?.category as VerdictWord | undefined) ?? null,
      drama: tags.length > 0 ? tags.reduce((sum, t) => sum + t.drama, 0) / tags.length : null,
      spot: walk?.spotName ?? null,
      stayedIn: walk?.walk.stayedIn ?? false,
      sleptIn: walk?.walk.sleptIn ?? false,
      rating: walk?.walk.rating ?? null,
      note: walk?.walk.note ?? null,
    });
  }
  return out;
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(key(row)) ?? [];
    list.push(row);
    map.set(key(row), list);
  }
  return map;
}
