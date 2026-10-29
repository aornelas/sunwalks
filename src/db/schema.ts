import {
  pgTable,
  text,
  timestamp,
  integer,
  real,
  date,
  uniqueIndex,
  index,
  jsonb,
  boolean,
  bigint,
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
    /** Where the photo was taken, as a named spot. Set by the owner (or a confirmed Claude suggestion), never committed — see lib/photo-source.ts. */
    place: text("place"),
    /** Files API id for the full-size derivative, so tagging and re-tagging upload each photo once. */
    claudeFileId: text("claude_file_id"),
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

/**
 * The planning view's forecast cache — one row per calendar day, keyed on
 * the owner's fixed home coordinates. Verdict/score/reason are derived
 * server-side (see lib/verdict.ts) so the phone and web view can never
 * disagree about whether a morning is Stunning. They're stored for
 * reference, but lib/planning.ts re-derives them from the inputs on read.
 */
export const forecastDays = pgTable("forecast_days", {
  date: date("date", { mode: "string" }).primaryKey(),
  sunrise: timestamp("sunrise", { withTimezone: true }).notNull(),
  civilTwilightBegin: timestamp("civil_twilight_begin", { withTimezone: true }).notNull(),
  goldenHourEnd: timestamp("golden_hour_end", { withTimezone: true }).notNull(),
  cloudTotal: real("cloud_total").notNull(),
  cloudLow: real("cloud_low").notNull(),
  cloudMid: real("cloud_mid").notNull(),
  cloudHigh: real("cloud_high").notNull(),
  tempAtSunrise: real("temp_at_sunrise").notNull(),
  apparentTemp: real("apparent_temp").notNull(),
  windSpeed: real("wind_speed").notNull(),
  windDir: real("wind_dir").notNull(),
  precipProbability: real("precip_probability").notNull(),
  fogProbability: real("fog_probability").notNull(),
  ceilingFt: real("ceiling_ft"),
  verdict: text("verdict").notNull(),
  score: integer("score").notNull(),
  reason: text("reason").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  token: text("token").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

/**
 * Claude's reading of each photo (see lib/tagging.ts and prompts/). One row
 * per photo, overwritten when the prompt version changes. observedCategory
 * is what the sky actually turned out to be, in the same vocabulary as
 * lib/verdict.ts, so it can be compared with forecast_snapshots.
 * suggestedPlace is only a suggestion; photos.place is the confirmed one.
 */
export const photoTags = pgTable(
  "photo_tags",
  {
    photoId: text("photo_id")
      .primaryKey()
      .references(() => photos.id, { onDelete: "cascade" }),
    promptVersion: text("prompt_version").notNull(),
    model: text("model").notNull(),
    observedCategory: text("observed_category").notNull(),
    categoryConfidence: text("category_confidence").notNull(),
    vantage: text("vantage").notNull(),
    colours: jsonb("colours").$type<{ hex: string; name: string }[]>().notNull(),
    cloudType: text("cloud_type").notNull(),
    cloudCover: integer("cloud_cover").notNull(),
    drama: integer("drama").notNull(),
    dramaReason: text("drama_reason").notNull(),
    mood: text("mood").notNull(),
    altText: text("alt_text").notNull(),
    suggestedPlace: text("suggested_place"),
    landmarks: jsonb("landmarks").$type<string[]>().notNull(),
    batchId: text("batch_id"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheCreationTokens: integer("cache_creation_tokens").notNull().default(0),
    taggedAt: timestamp("tagged_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("photo_tags_category_idx").on(t.observedCategory)],
);

/**
 * Message Batches submitted by `npm run tag-photos`. Persisted so a re-run
 * resumes an unfinished batch instead of paying for the same photos twice.
 */
export const taggingBatches = pgTable("tagging_batches", {
  id: text("id").primaryKey(), // Anthropic batch id
  promptVersion: text("prompt_version").notNull(),
  model: text("model").notNull(),
  photoIds: jsonb("photo_ids").$type<string[]>().notNull(),
  status: text("status", { enum: ["in_progress", "ended"] }).notNull().default("in_progress"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

/**
 * What the forecast said about a morning, kept per lead time so it survives
 * forecast_days being overwritten. leadDays is the number of owner-local
 * days between when the forecast was issued and the morning itself: 1 is
 * the evening-before prediction the calibration compares against, 0 the
 * morning-of. A live fetch replaces the row for its (date, lead) pair, so
 * the last forecast issued on a given day wins. "historical" rows are
 * rebuilt from Open-Meteo's Historical Forecast API (lead 0 only, since its
 * previous-runs archive lacks the cloud bands and visibility the verdict
 * needs).
 */
export const forecastSnapshots = pgTable(
  "forecast_snapshots",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    date: date("date", { mode: "string" }).notNull(),
    leadDays: integer("lead_days").notNull(),
    source: text("source", { enum: ["live", "historical"] }).notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    cloudTotal: real("cloud_total").notNull(),
    cloudLow: real("cloud_low").notNull(),
    cloudMid: real("cloud_mid").notNull(),
    cloudHigh: real("cloud_high").notNull(),
    tempAtSunrise: real("temp_at_sunrise").notNull(),
    windSpeed: real("wind_speed").notNull(),
    precipProbability: real("precip_probability").notNull(),
    fogProbability: real("fog_probability").notNull(),
    ceilingFt: real("ceiling_ft"),
    /** Derived when recorded, for reference; calibration re-derives from the inputs, as planning.ts does. */
    verdict: text("verdict").notNull(),
  },
  (t) => [uniqueIndex("forecast_snapshots_date_lead_source_idx").on(t.date, t.leadDays, t.source)],
);

/**
 * Named places the owner walks to (see lib/spots.ts). Names only by default:
 * coordinates are optional and unused until per-spot forecasts exist, and
 * real spots, like photos.place, live only in the database. `kind` sets the
 * engine's starting assumption about which skies a spot suits, before any
 * walks there have been logged.
 */
export const spots = pgTable("spots", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
  kind: text("kind", { enum: ["vantage", "forest", "short_walk", "waterfront"] }).notNull(),
  notes: text("notes"),
  lat: real("lat"),
  lon: real("lon"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One row per morning: where the owner went (or that they stayed in), how
 * it was, and anything they said about it. Photos aren't linked directly;
 * a morning's photos are the ones with the same date.
 */
export const walks = pgTable("walks", {
  date: date("date", { mode: "string" }).primaryKey(),
  spotId: integer("spot_id").references(() => spots.id, { onDelete: "set null" }),
  stayedIn: boolean("stayed_in").notNull().default(false),
  /** 1 (wasted trip) to 5 (best of the year). */
  rating: integer("rating"),
  note: text("note"),
  source: text("source", { enum: ["app", "cli", "telegram", "mcp", "seed"] }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The files behind Claude's memory tool (see lib/memory-store.ts): the
 * owner's preferences, in their own words as Claude has filed them, under
 * /memories. Kept in the database so every surface (CLI, Telegram, MCP)
 * reads and writes the same memory.
 */
export const memoryFiles = pgTable("memory_files", {
  path: text("path").primaryKey(),
  content: text("content").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** The latest recommendation for each morning, as the engine made it (see lib/recommend.ts). */
export const recommendations = pgTable("recommendations", {
  date: date("date", { mode: "string" }).primaryKey(),
  category: text("category").notNull(),
  confidence: real("confidence").notNull(),
  spot: text("spot").notNull(),
  payload: jsonb("payload").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Every update the Telegram webhook accepted (see app/api/telegram). The
 * primary key makes a redelivered update a no-op, and each row records how
 * handling went and what the Claude calls behind it cost.
 */
export const telegramUpdates = pgTable("telegram_updates", {
  updateId: bigint("update_id", { mode: "number" }).primaryKey(),
  kind: text("kind", { enum: ["command", "text", "photo", "button", "other"] }).notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  handledAt: timestamp("handled_at", { withTimezone: true }),
  error: text("error"),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  cacheCreationTokens: integer("cache_creation_tokens").notNull().default(0),
});
