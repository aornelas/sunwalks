// Where each morning was, set from the web app. A morning's place goes on
// its photos that have none (and on the photo being edited) and into the
// walk log, so a place confirmed for an old photo becomes history the
// engine learns from (place scores, calibration).
//
// The review queue is every morning with a photo that has no place yet,
// newest first, with a suggestion: the walk logged that morning, else
// another of its photos' place, else the place Claude's tagging read from
// the landmarks, when it names a spot.

import { and, count, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { days, photos, photoTags, walks } from "@/db/schema";
import { STAY_IN } from "./place-scores";
import { getWalk, listSpots, logWalk } from "./spots";

export interface ReviewMorning {
  date: string;
  /** The photo to show for the morning: its day photo, else its first. */
  photoId: string;
  photos: number;
  suggestion: string | null;
  suggestionSource: "walk log" | "another photo" | "landmarks" | null;
}

/** What a morning's place can be: one of the spots, or Home. */
export async function placeOptions(): Promise<string[]> {
  return [...(await listSpots()).map((s) => s.name), STAY_IN];
}

/** A spot named the way the owner names it, ignoring case and spacing. */
export function matchPlace(name: string | null | undefined, options: string[]): string | null {
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!name) return null;
  return options.find((o) => key(o) === key(name)) ?? null;
}

/** The most common of a morning's suggestions, or null with none. */
export function commonest(values: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  for (const [v, n] of counts) if (best == null || n > counts.get(best)!) best = v;
  return best;
}

export async function reviewQueue(): Promise<ReviewMorning[]> {
  const options = await placeOptions();
  const spotList = await listSpots();
  const unplaced = await db
    .select({ id: photos.id, date: photos.date, takenAt: photos.takenAt, suggested: photoTags.suggestedPlace })
    .from(photos)
    .leftJoin(photoTags, eq(photoTags.photoId, photos.id))
    .where(isNull(photos.place))
    .orderBy(desc(photos.date), photos.takenAt);
  if (unplaced.length === 0) return [];

  const dates = [...new Set(unplaced.map((p) => p.date))];
  const [walkRows, dayRows, placedRows] = await Promise.all([
    db.select().from(walks).where(inArray(walks.date, dates)),
    db.select().from(days).where(inArray(days.date, dates)),
    db.select({ date: photos.date, place: photos.place }).from(photos).where(inArray(photos.date, dates)),
  ]);
  const walkByDate = new Map(walkRows.map((w) => [w.date, w]));
  const dayShot = new Map(dayRows.map((d) => [d.date, d.dayShotId]));

  return dates.map((date) => {
    const shots = unplaced.filter((p) => p.date === date);
    const walk = walkByDate.get(date);
    const logged = walk?.stayedIn ? STAY_IN : (spotList.find((s) => s.id === walk?.spotId)?.name ?? null);
    const fromPhotos = commonest(placedRows.filter((r) => r.date === date).map((r) => matchPlace(r.place, options)));
    const fromTags = commonest(shots.map((s) => matchPlace(s.suggested, options)));
    const shown = shots.find((s) => s.id === dayShot.get(date)) ?? shots[0];
    const [suggestion, suggestionSource] = logged
      ? ([logged, "walk log"] as const)
      : fromPhotos
        ? ([fromPhotos, "another photo"] as const)
        : fromTags
          ? ([fromTags, "landmarks"] as const)
          : ([null, null] as const);
    return { date, photoId: shown.id, photos: shots.length, suggestion, suggestionSource };
  });
}

/**
 * Sets where a morning was: on its photos with no place yet and on
 * `photoId` (the one being edited, if any), and in the walk log (keeping a
 * logged rating, note and, when the place is unchanged, who logged it), so
 * the engine learns from it.
 */
export async function setMorningPlace(date: string, place: string, photoId?: string): Promise<void> {
  const options = await placeOptions();
  const name = matchPlace(place, options);
  if (!name) throw new Error(`"${place}" isn't one of your spots`);
  const [{ n }] = await db.select({ n: count() }).from(photos).where(eq(photos.date, date));
  if (n === 0) throw new Error(`No photos on ${date}`);

  const unplacedOrEdited = photoId ? or(isNull(photos.place), eq(photos.id, photoId)) : isNull(photos.place);
  await db.update(photos).set({ place: name }).where(and(eq(photos.date, date), unplacedOrEdited));

  const walk = await getWalk(date);
  const spotList = await listSpots();
  const logged = walk?.stayedIn ? STAY_IN : (spotList.find((s) => s.id === walk?.spotId)?.name ?? null);
  await logWalk({
    date,
    stayedIn: name === STAY_IN,
    spot: name === STAY_IN ? undefined : name,
    rating: walk?.rating ?? undefined,
    note: walk?.note ?? undefined,
    source: walk && logged === name ? walk.source : "app",
  });
}

/** How many mornings still need a place, for the settings entry. */
export async function unplacedMornings(): Promise<number> {
  const rows = await db.selectDistinct({ date: photos.date }).from(photos).where(isNull(photos.place));
  return rows.length;
}
