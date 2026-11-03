// The Sunwalks MCP server: the same engine the web app and the walk buddy
// use, as tools, resources and prompts for Claude Desktop, Claude Code and
// any other MCP client. It calls the Claude API only when asked for a fresh
// plan; everything else is the database and plain TypeScript.
//
//   recommend_walk     tonight's plan, as the planning card where MCP Apps render
//   log_walk           a morning's report; asks for a missing place or rating
//   list_spots         spots, their timings, and whether each fits tomorrow
//   forecast_accuracy  how often each forecast category held
//   find_photos        photos by date, sky and place
//
// The plan is advice. Nothing here records a choice the night before: the
// owner decides in the morning and reports where they went.

import Anthropic from "@anthropic-ai/sdk";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { acceptedContent, inputRequired, McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { and, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import * as z from "zod/v4";
import { db } from "@/db";
import { photos, photoTags, recommendations, spots, walks } from "@/db/schema";
import { computeCalibration, describeConfidence } from "@/lib/calibration";
import { addDays, formatTime, todayDayKey } from "@/lib/dates";
import { env } from "@/lib/env";
import { loadMornings } from "@/lib/mornings";
import { isTravel, STAY_IN } from "@/lib/place-scores";
import { getPhotoSource } from "@/lib/photo-source";
import { planningStartDate } from "@/lib/planning";
import { HOME_TIMING, reachFor } from "@/lib/reach";
import { recommendWalk, RecommendationSchema, type Recommendation } from "@/lib/recommend";
import { morningSchedule } from "@/lib/schedule";
import { listSpots, logWalk } from "@/lib/spots";
import { CATEGORY_ORDER, type VerdictWord } from "@/lib/verdict";
import { morningReport, SLEPT_IN } from "@/lib/walk-buddy";
import { planningCardHtml } from "./card-html";

export const CARD_URI = "ui://sunwalks/planning-card.html";
/** Reports go back as far as the walk buddy's. */
const REPORT_WINDOW_DAYS = 14;

const text = (value: unknown) => [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }];

// ─── The plan, and a past photo for each spot ───────────────────────────

const CardSpotSchema = z.object({
  spot: z.string(),
  reason: z.string(),
  photo: z
    .object({ id: z.string(), date: z.string(), sky: z.string().nullable(), alt: z.string(), dataUrl: z.string() })
    .nullable(),
});

const PlanSchema = z.object({
  date: z.string(),
  category: z.enum(CATEGORY_ORDER as [VerdictWord, ...VerdictWord[]]),
  confidence: z.number(),
  confidenceNote: z.string(),
  message: z.string(),
  spots: z.array(CardSpotSchema),
  createdAt: z.string(),
});
type Plan = z.infer<typeof PlanSchema>;

/**
 * The best photo from a spot: on a morning whose sky matched tonight's
 * forecast if there is one, the most dramatic otherwise, and the latest
 * untagged one (imports wait for `npm run tag-photos`) last. A photo is from a
 * spot when its own place says so or, with no place set (photos imported
 * from Google Photos), when that morning's walk was logged there. Inlined
 * as a small JPEG data URL, because the card's sandbox can't reach the
 * photo store.
 */
async function bestPhoto(spot: string, category: VerdictWord): Promise<Plan["spots"][number]["photo"]> {
  const loggedThere = spot === STAY_IN ? eq(walks.stayedIn, true) : eq(spots.name, spot);
  const rows = await db
    .select({ id: photos.id, date: photos.date, sky: photoTags.observedCategory, alt: photoTags.altText, drama: photoTags.drama })
    .from(photos)
    .leftJoin(photoTags, eq(photoTags.photoId, photos.id))
    .leftJoin(walks, eq(walks.date, photos.date))
    .leftJoin(spots, eq(spots.id, walks.spotId))
    .where(or(eq(photos.place, spot), and(isNull(photos.place), loggedThere)))
    .orderBy(sql`${photoTags.drama} desc nulls last`, desc(photos.date));
  const pick = rows.find((r) => r.sky === category) ?? rows[0];
  if (!pick) return null;
  const bytes = await getPhotoSource().getImage(pick.id, "sq");
  if (!bytes) return null;
  return { id: pick.id, date: pick.date, sky: pick.sky, alt: pick.alt ?? `Sunrise from ${spot}`, dataUrl: `data:image/jpeg;base64,${bytes.toString("base64")}` };
}

async function planFor(date: string, refresh: boolean): Promise<Plan | null> {
  let rec: Recommendation | null = null;
  let createdAt = new Date();
  if (refresh) {
    rec = (await recommendWalk(new Anthropic(), date)).recommendation;
  } else {
    const [row] = await db.select().from(recommendations).where(eq(recommendations.date, date)).limit(1);
    if (!row) return null;
    rec = RecommendationSchema.parse(row.payload);
    createdAt = row.createdAt;
  }
  const picks = [{ spot: rec.spot, reason: rec.reason }, ...rec.alternatives];
  return {
    date,
    category: rec.category,
    confidence: rec.confidence,
    confidenceNote: rec.confidence_note,
    message: rec.message,
    spots: await Promise.all(picks.map(async (p) => ({ ...p, photo: await bestPhoto(p.spot, rec.category) }))),
    createdAt: createdAt.toISOString(),
  };
}

/** What the model reads: the plan without the image bytes. */
function planText(plan: Plan): string {
  const lines = [
    `${plan.date}: ${plan.category}, ${Math.round(plan.confidence * 100)}% confidence (${plan.confidenceNote}).`,
    plan.message,
    ...plan.spots.map((s, i) => `${i === 0 ? "Best bet" : "Also"}: ${s.spot}. ${s.reason}${s.photo ? ` (past photo: ${[s.photo.date, s.photo.sky].filter(Boolean).join(", ")})` : ""}`),
  ];
  return lines.join("\n");
}

// ─── The morning report, asked for when something's missing ─────────────

function reportForm(placeNames: string[]) {
  return {
    type: "object" as const,
    properties: {
      place: { type: "string" as const, title: "Where were you?", enum: placeNames },
      rating: { type: "integer" as const, title: "How was the call? (1 wrong, 5 exactly right)", minimum: 1, maximum: 5 },
    },
    required: ["place"],
  };
}

const ReportAnswerSchema = z.object({ place: z.string(), rating: z.number().int().min(1).max(5).optional() });

// ─── The server ──────────────────────────────────────────────────────────

export function createSunwalksServer(): McpServer {
  const server = new McpServer({ name: "sunwalks", version: "0.1.0" });

  registerAppTool(
    server,
    "recommend_walk",
    {
      title: "Plan tomorrow's sunrise walk",
      description:
        "The plan for a sunrise walk: the sky the forecast points to, how far to trust it, and three spots that fit the morning, each with a past photo from there. It's advice: the owner decides in the morning. Returns the plan made in the evening; refresh re-plans now (a Claude API call).",
      inputSchema: z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("YYYY-MM-DD; the next sunrise by default."),
        refresh: z.boolean().optional().describe("Plan again now instead of returning the stored plan."),
      }),
      outputSchema: z.object({ plan: PlanSchema.nullable() }),
      annotations: { readOnlyHint: false, openWorldHint: true },
      _meta: { ui: { resourceUri: CARD_URI } },
    },
    async ({ date, refresh }) => {
      const day = date ?? planningStartDate();
      const plan = await planFor(day, refresh ?? false);
      if (!plan) {
        return {
          content: text(`No plan stored for ${day} yet (the evening job makes one). Call again with refresh: true to plan it now.`),
          structuredContent: { plan: null },
        };
      }
      return { content: text(planText(plan)), structuredContent: { plan } };
    },
  );

  registerAppResource(server, "Planning card", CARD_URI, { description: "The planning card for recommend_walk." }, async () => ({
    contents: [{ uri: CARD_URI, mimeType: RESOURCE_MIME_TYPE, text: await planningCardHtml(), _meta: { ui: { prefersBorder: false } } }],
  }));

  server.registerTool(
    "log_walk",
    {
      title: "Log a morning",
      description: `Logs (or corrects) one morning: where the owner was (one of their spots, "${STAY_IN}" for a morning in, or "${SLEPT_IN}" only when they say they missed the sunrise), a 1–5 rating of whether the choice paid off, and a short note. A field left out keeps what's logged. When the place is still unknown, the owner is asked with a form.`,
      inputSchema: z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("YYYY-MM-DD; today by default. Up to 14 days back."),
        place: z.string().optional(),
        rating: z.number().int().min(1).max(5).optional(),
        note: z.string().optional(),
      }),
      outputSchema: z.object({
        date: z.string(),
        place: z.string().nullable(),
        rating: z.number().nullable(),
        note: z.string().nullable(),
        photos: z.number(),
      }),
    },
    async ({ date, place, rating, note }, ctx) => {
      const today = todayDayKey(env.timezone);
      const day = date ?? today;
      if (day > today) throw new Error("That morning hasn't happened yet");
      if (day < addDays(today, -REPORT_WINDOW_DAYS)) throw new Error(`Reports go back ${REPORT_WINDOW_DAYS} days at most`);

      const before = await morningReport(day);
      const placeNames = [...(await listSpots()).map((s) => s.name), STAY_IN, SLEPT_IN];
      let where = place ?? (before.sleptIn ? SLEPT_IN : before.place);
      let stars = rating ?? before.rating;
      if (!where) {
        const answer = acceptedContent(ctx.mcpReq.inputResponses, "report", ReportAnswerSchema);
        if (!answer) {
          return inputRequired({
            inputRequests: {
              report: inputRequired.elicit({ message: `How was the morning of ${day}?`, requestedSchema: reportForm(placeNames) }),
            },
          });
        }
        where = answer.place;
        stars = answer.rating ?? stars;
      }
      if (!placeNames.includes(where)) throw new Error(`"${where}" isn't one of the spots. Known: ${placeNames.join(", ")}`);

      await logWalk({
        date: day,
        sleptIn: where === SLEPT_IN,
        stayedIn: where === STAY_IN,
        spot: where !== SLEPT_IN && where !== STAY_IN ? where : undefined,
        rating: where === SLEPT_IN ? undefined : (stars ?? undefined),
        note: note ?? before.note ?? undefined,
        source: "mcp",
      });
      const after = await morningReport(day);
      const report = { date: day, place: after.sleptIn ? SLEPT_IN : after.place, rating: after.rating, note: after.note, photos: after.photos };
      return { content: text(report), structuredContent: report };
    },
  );

  server.registerTool(
    "list_spots",
    {
      title: "List sunrise spots",
      description: "The owner's spots with their timings (minutes home from where they watch, and any walk there after sunrise), and whether each fits a morning's schedule. Travel spots (one-off mornings away) are left out.",
      inputSchema: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("YYYY-MM-DD; the next sunrise by default.") }),
      outputSchema: z.object({
        date: z.string(),
        sunrise: z.string(),
        schedule: z.object({ label: z.string(), backBy: z.string().nullable(), stayMinutes: z.number() }),
        spots: z.array(
          z.object({
            name: z.string(),
            kind: z.string(),
            minutesHome: z.number().nullable(),
            loopMinutes: z.number(),
            fits: z.enum(["in_reach", "too_far", "unknown"]),
            reason: z.string(),
          }),
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ date }) => {
      const day = date ?? planningStartDate();
      const [{ rule, backBy, sunrise }, spotList] = await Promise.all([morningSchedule(day), listSpots()]);
      const spots = [
        ...spotList.filter((s) => !isTravel(s)).map((s) => ({ name: s.name, kind: s.kind as string, timing: s })),
        { name: STAY_IN, kind: "home", timing: HOME_TIMING },
      ].map(({ name, kind, timing }) => {
        const r = reachFor(sunrise, rule, backBy, timing, env.timezone);
        return { name, kind, minutesHome: timing.minutesHome, loopMinutes: timing.loopMinutes, fits: r.status, reason: r.reason };
      });
      const result = {
        date: day,
        sunrise: formatTime(sunrise, env.timezone),
        schedule: { label: rule.label, backBy: rule.backBy, stayMinutes: rule.stayMinutes },
        spots,
      };
      return { content: text(result), structuredContent: result };
    },
  );

  server.registerTool(
    "forecast_accuracy",
    {
      title: "How often the forecast held",
      description: "For each forecast category, how many mornings it was forecast, how often the photographed sky matched, and what it turned out to be instead.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        compared: z.number(),
        held: z.number(),
        categories: z.array(
          z.object({
            category: z.string(),
            forecasts: z.number(),
            held: z.number(),
            heldRate: z.number().nullable(),
            confidence: z.number(),
            summary: z.string(),
            turnedOut: z.array(z.object({ category: z.string(), count: z.number() })),
          }),
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const cal = computeCalibration(await loadMornings());
      const result = {
        compared: cal.compared,
        held: cal.held,
        categories: cal.byCategory.map((c) => ({
          category: c.category,
          forecasts: c.forecasts,
          held: c.held,
          heldRate: c.heldRate,
          confidence: c.confidence,
          summary: describeConfidence(c),
          turnedOut: c.turnedOut,
        })),
      };
      return { content: text(result), structuredContent: result };
    },
  );

  server.registerTool(
    "find_photos",
    {
      title: "Find sunrise photos",
      description: "Photos by date range, the sky they show, and where they were taken. Each result has a sunwalks://photo/{id} resource with the image.",
      inputSchema: z.object({
        start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        sky: z.enum(CATEGORY_ORDER as [VerdictWord, ...VerdictWord[]]).optional(),
        place: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional().describe("20 by default."),
      }),
      outputSchema: z.object({
        photos: z.array(
          z.object({
            id: z.string(),
            date: z.string(),
            takenAt: z.string(),
            place: z.string().nullable(),
            sky: z.string().nullable(),
            drama: z.number().nullable(),
            alt: z.string().nullable(),
            uri: z.string(),
          }),
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ start, end, sky, place, limit }) => {
      const conditions = [
        start ? gte(photos.date, start) : undefined,
        end ? lte(photos.date, end) : undefined,
        sky ? eq(photoTags.observedCategory, sky) : undefined,
        place ? eq(photos.place, place) : undefined,
      ].filter((c) => c != null);
      const rows = await db
        .select({
          id: photos.id,
          date: photos.date,
          takenAt: photos.takenAt,
          place: photos.place,
          sky: photoTags.observedCategory,
          drama: photoTags.drama,
          alt: photoTags.altText,
        })
        .from(photos)
        .leftJoin(photoTags, eq(photoTags.photoId, photos.id))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(photos.takenAt))
        .limit(limit ?? 20);
      const result = { photos: rows.map((r) => ({ ...r, takenAt: r.takenAt.toISOString(), uri: `sunwalks://photo/${r.id}` })) };
      return { content: text(result), structuredContent: result };
    },
  );

  // ─── Resources ─────────────────────────────────────────────────────────

  server.registerResource(
    "spots",
    "sunwalks://spots",
    { title: "Sunrise spots", description: "The owner's spots and their timings.", mimeType: "application/json" },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(await listSpots(), null, 2) }] }),
  );

  server.registerResource(
    "spot",
    new ResourceTemplate("sunwalks://spot/{name}", {
      list: async () => ({
        resources: (await listSpots()).map((s) => ({ uri: `sunwalks://spot/${encodeURIComponent(s.name)}`, name: s.name })),
      }),
    }),
    { title: "A spot", description: "One spot, its timing, and its logged mornings.", mimeType: "application/json" },
    async (uri, { name }) => {
      const spotName = decodeURIComponent(String(name));
      const spot = (await listSpots()).find((s) => s.name === spotName);
      if (!spot) throw new Error(`No spot "${spotName}"`);
      const mornings = (await loadMornings())
        .filter((m) => m.spot === spot.name)
        .map((m) => ({ date: m.date, forecast: m.forecast, observed: m.observed, rating: m.rating, note: m.note }));
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify({ ...spot, mornings }, null, 2) }] };
    },
  );

  server.registerResource(
    "photo",
    new ResourceTemplate("sunwalks://photo/{id}", { list: undefined }),
    { title: "A photo", description: "One sunrise photo, as a JPEG up to 1600px wide.", mimeType: "image/jpeg" },
    async (uri, { id }) => {
      const bytes = await getPhotoSource().getImage(String(id), "full");
      if (!bytes) throw new Error(`No photo ${id}`);
      return { contents: [{ uri: uri.href, mimeType: "image/jpeg", blob: bytes.toString("base64") }] };
    },
  );

  // ─── Prompts ───────────────────────────────────────────────────────────

  server.registerPrompt(
    "plan-tomorrow",
    {
      title: "Plan tomorrow",
      description: "Where to go for tomorrow's sunrise, as the planning card.",
      argsSchema: z.object({}),
    },
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "Plan tomorrow's sunrise walk: call recommend_walk and tell me in a sentence or two where you'd go and why. It's a suggestion; I'll decide in the morning.",
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "how-was-it",
    {
      title: "How was it?",
      description: "Report this morning's sunrise: where you went and how it was.",
      argsSchema: z.object({ notes: z.string().optional().describe("Anything you'd like to say about the morning.") }),
    },
    async ({ notes }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Log this morning's sunrise with log_walk.${notes ? ` What I said about it: ${notes}` : " Ask me where I was if you don't know."} Then tell me what was logged.`,
          },
        },
      ],
    }),
  );

  return server;
}

