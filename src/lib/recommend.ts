// The walk recommender: Claude, four tools over the engine's data, and
// the memory tool for the owner's preferences, run through the explicit
// loop in tool-loop.ts. The statistics are computed in plain TypeScript
// (calibration.ts, place-scores.ts); Claude's job is to weigh them against
// what the owner has said and write the plan in the app's voice.

import { readFileSync } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { db } from "@/db";
import { recommendations } from "@/db/schema";
import { computeCalibration, describeConfidence, observedDistribution } from "./calibration";
import { formatTime, todayDayKey } from "./dates";
import { env } from "./env";
import { loadMornings, type MorningRecord } from "./mornings";
import { computeSpotScores, rankSpots, STAY_IN } from "./place-scores";
import { jsonSchemaFor } from "./json-schema";
import { getPlanningResponse } from "./planning";
import { listSpots } from "./spots";
import { runToolLoop, finalText, type LoopEvent, type LoopTool } from "./tool-loop";
import { buildReason, CATEGORY_ORDER, type VerdictWord } from "./verdict";

export const RECOMMEND_PROMPT_VERSION = "recommend-walk/v1";

export function recommendModel(): string {
  return process.env.RECOMMEND_MODEL || "claude-opus-5-5";
}

export const RecommendationSchema = z.object({
  category: z.enum(CATEGORY_ORDER as [VerdictWord, ...VerdictWord[]]),
  confidence: z.number().min(0).max(1),
  confidence_note: z.string().min(1),
  spot: z.string().min(1),
  reason: z.string().min(1),
  alternatives: z.array(z.object({ spot: z.string().min(1), reason: z.string().min(1) })).max(2),
  message: z.string().min(1),
});

export type Recommendation = z.infer<typeof RecommendationSchema>;

const categoryInput: Anthropic.Tool.InputSchema = {
  type: "object",
  properties: { category: { type: "string", enum: CATEGORY_ORDER } },
  required: ["category"],
  additionalProperties: false,
};

/** Everything the tools read, loaded once per recommendation. */
interface EngineData {
  /** Only mornings before the one being planned, so planning a past date can't see how it went. */
  mornings: MorningRecord[];
  /** The planned morning's own record, for its stored forecast when it's in the past. */
  target: MorningRecord | undefined;
  calibration: ReturnType<typeof computeCalibration>;
  spotScores: ReturnType<typeof computeSpotScores>;
  spotNotes: Map<string, string | null>;
}

async function loadEngineData(date: string): Promise<EngineData> {
  const [all, spotList] = await Promise.all([loadMornings(), listSpots()]);
  const mornings = all.filter((m) => m.date < date);
  return {
    mornings,
    target: all.find((m) => m.date === date),
    calibration: computeCalibration(mornings),
    spotScores: computeSpotScores(spotList, mornings),
    spotNotes: new Map(spotList.map((s) => [s.name, s.notes])),
  };
}

function round(n: number, places = 2): number {
  return Math.round(n * 10 ** places) / 10 ** places;
}

function buildTools(data: EngineData): LoopTool[] {
  return [
    {
      definition: {
        name: "get_forecast",
        description:
          "The sunrise forecast for one morning at the owner's home: the category (Stunning, Nice, Clear, Foggy or Wet), the one-line reason, sunrise time, and the inputs behind it (cloud cover by level, rain and fog chance, the marine-layer ceiling).",
        strict: true,
        input_schema: {
          type: "object",
          properties: { date: { type: "string", description: "The morning, as YYYY-MM-DD." } },
          required: ["date"],
          additionalProperties: false,
        },
      },
      async run(input) {
        const { date } = input as { date: string };
        // A past morning is answered from what the forecast said at the time
        // (forecast_snapshots), which is what makes a backtest honest.
        if (date < todayDayKey(env.timezone)) {
          const past = data.target;
          if (past?.date !== date || !past.snapshot) throw new Error(`No stored forecast for ${date}`);
          const s = past.snapshot;
          return {
            date,
            category: past.forecast,
            reason: buildReason(past.forecast!, s),
            source: `${s.source} forecast, ${s.leadDays} day(s) ahead`,
            cloud: { total: s.cloudTotal, low: s.cloudLow, mid: s.cloudMid, high: s.cloudHigh },
            rainChance: s.precipProbability,
            fogChance: s.fogProbability,
            ceilingFt: s.ceilingFt,
            tempF: s.tempAtSunrise,
            windMph: s.windSpeed,
          };
        }
        const day = (await getPlanningResponse(date)).days.find((d) => d.date === date);
        if (!day) throw new Error(`No forecast available for ${date}`);
        return {
          date: day.date,
          category: day.verdict,
          reason: day.reason,
          sunrise: formatTime(new Date(day.sunrise), env.timezone),
          cloud: { total: day.cloudTotal, low: day.cloudLow, mid: day.cloudMid, high: day.cloudHigh },
          rainChance: day.precipProbability,
          fogChance: day.fogProbability,
          ceilingFt: day.ceilingFt,
          tempF: day.tempAtSunrise,
          windMph: day.windSpeed,
        };
      },
    },
    {
      definition: {
        name: "forecast_accuracy",
        description:
          "How often forecasts of one category have come true, judged against the sky in the owner's photos: a held count, a smoothed confidence (0 to 1) and what the sky turned out to be on the mornings it didn't hold.",
        strict: true,
        input_schema: categoryInput,
      },
      async run(input) {
        const { category } = input as { category: VerdictWord };
        const c = data.calibration.byCategory.find((row) => row.category === category)!;
        return {
          category,
          summary: describeConfidence(c),
          forecasts: c.forecasts,
          held: c.held,
          confidence: round(c.confidence),
          turnedOutInstead: c.turnedOut,
        };
      },
    },
    {
      definition: {
        name: "spots_for",
        description:
          "The owner's spots (and staying in) ranked for a forecast category. `expected` (0 to 1) blends how each spot has gone on each kind of sky with how likely each sky is given this forecast; spots with few walks lean on a default for their kind (high places for colour, forest for fog, a short walk for clear skies, bed for rain).",
        strict: true,
        input_schema: categoryInput,
      },
      async run(input) {
        const { category } = input as { category: VerdictWord };
        const odds = observedDistribution(data.calibration, category);
        return {
          likelySkies: Object.fromEntries(CATEGORY_ORDER.map((c) => [c, round(odds[c])])),
          spots: rankSpots(data.spotScores, odds, category)
            .slice(0, 6)
            .map((s) => ({
              spot: s.spot,
              kind: s.kind,
              expected: round(s.expected),
              walksUnderThisSky: s.walksUnderSky,
              totalWalks: s.totalWalks,
              notes: data.spotNotes.get(s.spot) ?? null,
            })),
        };
      },
    },
    {
      definition: {
        name: "similar_mornings",
        description:
          "Past mornings that were forecast as this category, most recent first: what the sky actually was, where the owner went (or that they stayed in), their 1–5 rating, any note, the photos' drama (1–10) and the forecast ceiling.",
        strict: true,
        input_schema: {
          type: "object",
          properties: {
            category: { type: "string", enum: CATEGORY_ORDER },
            limit: { type: "integer", description: "How many mornings, at most 15." },
          },
          required: ["category", "limit"],
          additionalProperties: false,
        },
      },
      async run(input) {
        const { category, limit } = input as { category: VerdictWord; limit: number };
        return data.mornings
          .filter((m) => m.forecast === category && (m.observed || m.spot || m.stayedIn))
          .reverse()
          .slice(0, Math.min(Math.max(limit, 1), 15))
          .map((m) => ({
            date: m.date,
            observed: m.observed,
            went: m.stayedIn ? STAY_IN : m.spot,
            rating: m.rating,
            note: m.note,
            drama: m.drama != null ? round(m.drama, 1) : null,
            ceilingFt: m.ceilingFt,
          }));
      },
    },
  ];
}

let systemPrompt: string | null = null;

function loadSystemPrompt(): string {
  systemPrompt ??= readFileSync(path.join(process.cwd(), "prompts", `${RECOMMEND_PROMPT_VERSION}.md`), "utf8");
  return systemPrompt;
}

export interface RecommendResult {
  recommendation: Recommendation;
  turns: number;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number };
}

/** Plans the walk for `date` (a day key), stores it, and returns it. */
export async function recommendWalk(
  client: Anthropic,
  date: string,
  onToolCall?: (event: LoopEvent) => void,
): Promise<RecommendResult> {
  const data = await loadEngineData(date);
  const model = recommendModel();
  const { message, turns, usage } = await runToolLoop(client, {
    model,
    system: loadSystemPrompt(),
    prompt: `Plan the walk for the morning of ${date}.`,
    tools: buildTools(data),
    memory: true,
    outputFormat: { type: "json_schema", schema: jsonSchemaFor(RecommendationSchema) },
    onToolCall,
  });

  const parsed = RecommendationSchema.safeParse(JSON.parse(finalText(message)));
  if (!parsed.success) throw new Error(`Recommendation failed validation: ${parsed.error.message}`);
  const recommendation = parsed.data;
  const known = new Set(data.spotScores.map((s) => s.spot));
  for (const pick of [recommendation.spot, ...recommendation.alternatives.map((a) => a.spot)]) {
    if (!known.has(pick)) throw new Error(`Recommended "${pick}", which isn't one of the owner's spots`);
  }

  const row = {
    date,
    category: recommendation.category,
    confidence: recommendation.confidence,
    spot: recommendation.spot,
    payload: recommendation,
    model: message.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    createdAt: new Date(),
  };
  await db.insert(recommendations).values(row).onConflictDoUpdate({ target: recommendations.date, set: row });
  return { recommendation, turns, usage };
}
