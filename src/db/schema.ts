import {
  pgTable,
  text,
  timestamp,
  integer,
  date,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/**
 * Single-owner app: one row, ever. Holds the Google identity that's allowed
 * to sign in and the encrypted refresh token used to mint access tokens for
 * Picker API sessions (there's no "album" to store anymore — see ingest.ts).
 */
export const ownerAccount = pgTable("owner_account", {
  id: integer("id").primaryKey().default(1),
  email: text("email").notNull(),
  googleSub: text("google_sub").notNull(),
  refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
  lastPickedAt: timestamp("last_picked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const days = pgTable("days", {
  date: date("date", { mode: "string" }).primaryKey(),
  dayShotId: text("day_shot_id"),
});

export const photos = pgTable(
  "photos",
  {
    id: text("id").primaryKey(), // Google mediaItem id
    date: date("date", { mode: "string" }).notNull(),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull(),
    filename: text("filename").notNull(),
    width: integer("width"),
    height: integer("height"),
    place: text("place"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("photos_date_idx").on(t.date)],
);

export const syncLog = pgTable("sync_log", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status", { enum: ["running", "ok", "error"] }).notNull().default("running"),
  photosAdded: integer("photos_added").notNull().default(0),
  error: text("error"),
});

export const shareLinks = pgTable(
  "share_links",
  {
    token: text("token").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("share_links_token_idx").on(t.token)],
);

export const sessions = pgTable("sessions", {
  token: text("token").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
