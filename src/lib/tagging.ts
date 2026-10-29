import { readFileSync } from "node:fs";
import path from "node:path";
import Anthropic, { toFile } from "@anthropic-ai/sdk";
import { asc, eq, isNull, ne, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { photoTags, photos } from "@/db/schema";
import { jsonSchemaFor } from "./json-schema";
import type { PhotoSource, SourcePhoto } from "./photo-source";

/**
 * Vision tagging: Claude reads each sunrise photo and returns the sky
 * category it actually was (the same five words lib/verdict.ts forecasts),
 * a place suggestion from visible landmarks, and the descriptive tags the
 * calendar uses (alt text, colours, drama, mood).
 *
 * The prompt lives in prompts/, one file per version. Bumping
 * TAG_PROMPT_VERSION makes every photo pending again, so `npm run
 * tag-photos` re-tags the archive under the new definitions; leaving it
 * alone makes re-runs free.
 */

export const TAG_PROMPT_VERSION = "tag-photo/v1";

const DEFAULT_MODEL = "claude-opus-5-5";

export function taggingModel(): string {
  return process.env.TAGGING_MODEL || DEFAULT_MODEL;
}

const CATEGORIES = ["Stunning", "Nice", "Clear", "Foggy", "Wet"] as const;

const CLOUD_TYPES = [
  "none",
  "cirrus",
  "cirrostratus",
  "cirrocumulus",
  "altostratus",
  "altocumulus",
  "stratus",
  "stratocumulus",
  "cumulus",
  "cumulonimbus",
  "fog",
  "mixed",
] as const;

export const PhotoTagSchema = z.object({
  observed_category: z.enum(CATEGORIES),
  category_confidence: z.enum(["low", "medium", "high"]),
  vantage: z.enum(["outdoors", "window"]),
  colours: z
    .array(z.object({ hex: z.string().regex(/^#[0-9a-f]{6}$/), name: z.string().min(1) }))
    .min(1)
    .max(5),
  cloud_type: z.enum(CLOUD_TYPES),
  cloud_cover: z.number().int().min(0).max(100),
  drama: z.number().int().min(1).max(10),
  drama_reason: z.string().min(1),
  mood: z.string().min(1),
  alt_text: z.string().min(1),
  landmarks: z.array(z.string()),
  suggested_place: z.string().nullable(),
});

export type PhotoTag = z.infer<typeof PhotoTagSchema>;

export const OUTPUT_FORMAT: Anthropic.JSONOutputFormat = {
  type: "json_schema",
  schema: jsonSchemaFor(PhotoTagSchema),
};

let promptCache: string | null = null;

function loadPrompt(): string {
  promptCache ??= readFileSync(path.join(process.cwd(), "prompts", `${TAG_PROMPT_VERSION}.md`), "utf8");
  return promptCache;
}

/** Photos with no tags, or tags from an older prompt version. */
export async function pendingPhotos(): Promise<{ id: string; claudeFileId: string | null }[]> {
  return db
    .select({ id: photos.id, claudeFileId: photos.claudeFileId })
    .from(photos)
    .leftJoin(photoTags, eq(photoTags.photoId, photos.id))
    .where(or(isNull(photoTags.photoId), ne(photoTags.promptVersion, TAG_PROMPT_VERSION)))
    .orderBy(asc(photos.takenAt));
}

/**
 * Uploads the full-size derivative to the Files API once and remembers the
 * id, so tagging, re-tagging and later comparisons reference the same file
 * instead of resending the bytes.
 */
export async function ensureUploaded(
  client: Anthropic,
  source: PhotoSource,
  photo: { id: string; claudeFileId: string | null },
): Promise<string> {
  if (photo.claudeFileId) return photo.claudeFileId;
  const bytes = await source.getImage(photo.id, "full");
  if (!bytes) throw new Error(`No stored image for photo ${photo.id}`);
  const uploaded = await client.files.upload({
    file: await toFile(bytes, `${photo.id}.jpg`, { type: "image/jpeg" }),
  });
  await db.update(photos).set({ claudeFileId: uploaded.id }).where(eq(photos.id, photo.id));
  return uploaded.id;
}

/**
 * One tagging request. The system prompt and the known-places list come
 * first and carry the cache breakpoint, so every photo in a run after the
 * first reads them from the cache; only the image differs per request.
 */
export function buildTagRequest(fileId: string, places: string[]): Anthropic.MessageCreateParamsNonStreaming {
  const placesText =
    places.length > 0
      ? `The owner's known places:\n${places.map((p) => `- ${p}`).join("\n")}`
      : "The owner hasn't named any places yet.";
  return {
    model: taggingModel(),
    max_tokens: 16000,
    // Reading a sky is perception, not long reasoning: low effort holds
    // quality here and keeps a whole-archive run cheap.
    output_config: { effort: "low", format: OUTPUT_FORMAT },
    system: [
      { type: "text", text: loadPrompt() },
      { type: "text", text: placesText, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "file", file_id: fileId } },
          { type: "text", text: "Tag this photo." },
        ],
      },
    ],
  };
}

export interface TagUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

function usageOf(message: Anthropic.Message): TagUsage {
  return {
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
    cacheCreationTokens: message.usage.cache_creation_input_tokens ?? 0,
  };
}

/** Validates a response against PhotoTagSchema; throws with the reason if it doesn't. */
export function parseTagResponse(message: Anthropic.Message): { tag: PhotoTag; usage: TagUsage } {
  if (message.stop_reason === "refusal") {
    throw new Error(`Refused (${message.stop_details?.category ?? "no category"})`);
  }
  if (message.stop_reason === "max_tokens") throw new Error("Hit max_tokens before finishing");
  const text = message.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!text) throw new Error("No text block in response");
  const parsed = PhotoTagSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error(`Schema validation failed: ${parsed.error.message}`);
  return { tag: parsed.data, usage: usageOf(message) };
}

export async function saveTag(
  photoId: string,
  tag: PhotoTag,
  usage: TagUsage,
  meta: { model: string; batchId?: string; promptVersion?: string },
): Promise<void> {
  const row = {
    photoId,
    promptVersion: meta.promptVersion ?? TAG_PROMPT_VERSION,
    model: meta.model,
    observedCategory: tag.observed_category,
    categoryConfidence: tag.category_confidence,
    vantage: tag.vantage,
    colours: tag.colours,
    cloudType: tag.cloud_type,
    cloudCover: tag.cloud_cover,
    drama: tag.drama,
    dramaReason: tag.drama_reason,
    mood: tag.mood,
    altText: tag.alt_text,
    suggestedPlace: tag.suggested_place,
    landmarks: tag.landmarks,
    batchId: meta.batchId ?? null,
    ...usage,
    taggedAt: new Date(),
  };
  await db.insert(photoTags).values(row).onConflictDoUpdate({ target: photoTags.photoId, set: row });
}

/** Tags one photo with a regular Messages API call — for new photos as they arrive, and small runs. */
export async function tagPhoto(
  client: Anthropic,
  source: PhotoSource,
  photo: Pick<SourcePhoto, "id"> & { claudeFileId: string | null },
  places: string[],
): Promise<{ tag: PhotoTag; usage: TagUsage }> {
  const fileId = await ensureUploaded(client, source, photo);
  const message = await client.messages.create(buildTagRequest(fileId, places));
  const result = parseTagResponse(message);
  await saveTag(photo.id, result.tag, result.usage, { model: message.model });
  return result;
}

/** Running token totals for a tagging run, printed at the end so cost and cache hits are visible. */
export class UsageTally {
  readonly total: TagUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
  requests = 0;
  cacheHits = 0;

  add(usage: TagUsage): void {
    this.requests++;
    if (usage.cacheReadTokens > 0) this.cacheHits++;
    this.total.inputTokens += usage.inputTokens;
    this.total.outputTokens += usage.outputTokens;
    this.total.cacheReadTokens += usage.cacheReadTokens;
    this.total.cacheCreationTokens += usage.cacheCreationTokens;
  }

  summary(): string {
    const t = this.total;
    const promptTokens = t.inputTokens + t.cacheReadTokens + t.cacheCreationTokens;
    const cachedShare = promptTokens > 0 ? Math.round((100 * t.cacheReadTokens) / promptTokens) : 0;
    return [
      `${this.requests} requests, ${this.cacheHits} with cache hits`,
      `input ${t.inputTokens} uncached + ${t.cacheReadTokens} cache read + ${t.cacheCreationTokens} cache write (${cachedShare}% of prompt tokens from cache)`,
      `output ${t.outputTokens}`,
    ].join("; ");
  }
}
