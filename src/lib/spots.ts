// Spots and the walk log: the engine's record of where the owner went.
// Every surface (CLI now; Telegram and MCP later) logs through here.

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { spots, walks } from "@/db/schema";
import { normalizePlace } from "./photo-source";
import { STAY_IN, type SpotKind } from "./place-scores";

export type Spot = typeof spots.$inferSelect;

export async function listSpots(): Promise<Spot[]> {
  return db.select().from(spots).orderBy(asc(spots.name));
}

/** Case-insensitive, whitespace-insensitive lookup, so "telegraph hill" finds "Telegraph Hill". */
export async function findSpot(name: string): Promise<Spot | undefined> {
  const wanted = normalizePlace(name)?.toLowerCase();
  if (!wanted) return undefined;
  return (await listSpots()).find((s) => s.name.toLowerCase() === wanted);
}

export async function addSpot(name: string, kind: SpotKind, notes?: string): Promise<Spot> {
  const clean = normalizePlace(name);
  if (!clean) throw new Error("A spot needs a name");
  if (clean.toLowerCase() === STAY_IN.toLowerCase()) throw new Error(`"${STAY_IN}" is reserved for mornings in`);
  const existing = await findSpot(clean);
  if (existing) return existing;
  const [row] = await db.insert(spots).values({ name: clean, kind, notes: notes ?? null }).returning();
  return row;
}

/**
 * How long it takes to get home from where the sunrise is watched (every
 * leg: walking back to the car and the drive), and any walk taken there
 * after sunrise. Together they decide whether the spot is in reach on a
 * morning with somewhere to be (see reach.ts).
 */
export async function setSpotTiming(name: string, timing: { minutesHome: number; loopMinutes?: number }): Promise<Spot> {
  const spot = await findSpot(name);
  if (!spot) throw new Error(`Unknown spot "${name}". Add it first.`);
  for (const n of [timing.minutesHome, timing.loopMinutes ?? 0]) {
    if (!Number.isInteger(n) || n < 0 || n > 240) throw new Error("Minutes are whole numbers from 0 to 240");
  }
  const [row] = await db
    .update(spots)
    .set({ minutesHome: timing.minutesHome, loopMinutes: timing.loopMinutes ?? spot.loopMinutes })
    .where(eq(spots.id, spot.id))
    .returning();
  return row;
}

export interface WalkEntry {
  date: string;
  /** A spot name, or omit with `stayedIn` or `sleptIn`. */
  spot?: string;
  stayedIn?: boolean;
  sleptIn?: boolean;
  rating?: number;
  note?: string;
  source: (typeof walks.$inferInsert)["source"];
}

/** Logs (or corrects) a morning. A later entry for the same date replaces the earlier one. */
export async function logWalk(entry: WalkEntry): Promise<void> {
  if (entry.rating != null && (!Number.isInteger(entry.rating) || entry.rating < 1 || entry.rating > 5)) {
    throw new Error("Rating must be a whole number from 1 to 5");
  }
  if (entry.stayedIn && entry.sleptIn) throw new Error("A morning is either at home or slept through, not both");
  let spotId: number | null = null;
  if (!entry.stayedIn && !entry.sleptIn) {
    if (!entry.spot) throw new Error("Say where you walked, or that you stayed in");
    const spot = await findSpot(entry.spot);
    if (!spot) throw new Error(`Unknown spot "${entry.spot}". Add it first.`);
    spotId = spot.id;
  }
  const row = {
    date: entry.date,
    spotId,
    stayedIn: entry.stayedIn ?? false,
    sleptIn: entry.sleptIn ?? false,
    rating: entry.rating ?? null,
    note: entry.note ?? null,
    source: entry.source,
  };
  await db.insert(walks).values(row).onConflictDoUpdate({ target: walks.date, set: row });
}

/** Undoes "slept in" for a morning that turns out to have a sunrise photo. */
export async function clearSleptIn(date: string): Promise<void> {
  await db.delete(walks).where(and(eq(walks.date, date), eq(walks.sleptIn, true)));
}

export async function getWalk(date: string) {
  const [row] = await db.select().from(walks).where(eq(walks.date, date)).limit(1);
  return row;
}
