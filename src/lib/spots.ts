// Spots and the walk log: the engine's record of where the owner went.
// Every surface (CLI now; Telegram and MCP later) logs through here.

import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { spots, walks } from "@/db/schema";
import { normalizePlace } from "./photo-source";
import type { SpotKind } from "./place-scores";

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
  const existing = await findSpot(clean);
  if (existing) return existing;
  const [row] = await db.insert(spots).values({ name: clean, kind, notes: notes ?? null }).returning();
  return row;
}

export interface WalkEntry {
  date: string;
  /** A spot name, or omit with `stayedIn: true`. */
  spot?: string;
  stayedIn?: boolean;
  rating?: number;
  note?: string;
  source: (typeof walks.$inferInsert)["source"];
}

/** Logs (or corrects) a morning. A later entry for the same date replaces the earlier one. */
export async function logWalk(entry: WalkEntry): Promise<void> {
  if (entry.rating != null && (!Number.isInteger(entry.rating) || entry.rating < 1 || entry.rating > 5)) {
    throw new Error("Rating must be a whole number from 1 to 5");
  }
  let spotId: number | null = null;
  if (!entry.stayedIn) {
    if (!entry.spot) throw new Error("Say where you walked, or that you stayed in");
    const spot = await findSpot(entry.spot);
    if (!spot) throw new Error(`Unknown spot "${entry.spot}". Add it first.`);
    spotId = spot.id;
  }
  const row = {
    date: entry.date,
    spotId,
    stayedIn: entry.stayedIn ?? false,
    rating: entry.rating ?? null,
    note: entry.note ?? null,
    source: entry.source,
  };
  await db.insert(walks).values(row).onConflictDoUpdate({ target: walks.date, set: row });
}

export async function getWalk(date: string) {
  const [row] = await db.select().from(walks).where(eq(walks.date, date)).limit(1);
  return row;
}
