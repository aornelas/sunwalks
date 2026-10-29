// Schema validation and request shape for vision tagging. The Claude API is
// never called: responses are built by hand in the shape the SDK returns.
import { test } from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";

// lib/db throws at import without a connection string; nothing here connects.
process.env.DATABASE_URL ??= "postgres://test@localhost/unused";
const { OUTPUT_FORMAT, PhotoTagSchema, buildTagRequest, parseTagResponse } = await import("../src/lib/tagging");

const VALID_TAG = {
  observed_category: "Stunning",
  category_confidence: "high",
  vantage: "outdoors",
  colours: [
    { hex: "#e0954f", name: "burnt orange" },
    { hex: "#f2c4a8", name: "peach" },
  ],
  cloud_type: "altocumulus",
  cloud_cover: 55,
  drama: 8,
  drama_reason: "Pink underlit altocumulus across the whole sky.",
  mood: "fiery",
  alt_text: "Rippled clouds glow orange and pink over a dark city skyline.",
  landmarks: ["Coit Tower"],
  suggested_place: "Telegraph Hill",
};

function mockMessage(text: string, overrides: Partial<Anthropic.Message> = {}): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [{ type: "text", text, citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 1800,
      output_tokens: 240,
      cache_read_input_tokens: 900,
      cache_creation_input_tokens: 0,
    },
    ...overrides,
  } as Anthropic.Message;
}

test("a valid response parses, with its usage", () => {
  const { tag, usage } = parseTagResponse(mockMessage(JSON.stringify(VALID_TAG)));
  assert.equal(tag.observed_category, "Stunning");
  assert.equal(tag.suggested_place, "Telegraph Hill");
  assert.deepEqual(usage, { inputTokens: 1800, outputTokens: 240, cacheReadTokens: 900, cacheCreationTokens: 0 });
});

test("a category outside the forecast's vocabulary is rejected", () => {
  const bad = { ...VALID_TAG, observed_category: "Gorgeous" };
  assert.throws(() => parseTagResponse(mockMessage(JSON.stringify(bad))), /Schema validation failed/);
});

test("ranges the API can't enforce are enforced after parsing", () => {
  assert.equal(PhotoTagSchema.safeParse({ ...VALID_TAG, drama: 11 }).success, false);
  assert.equal(PhotoTagSchema.safeParse({ ...VALID_TAG, cloud_cover: -1 }).success, false);
  assert.equal(PhotoTagSchema.safeParse({ ...VALID_TAG, colours: [{ hex: "orange", name: "orange" }] }).success, false);
  assert.equal(PhotoTagSchema.safeParse({ ...VALID_TAG, colours: [] }).success, false);
});

test("refusals and truncated responses are errors, not empty tags", () => {
  assert.throws(() => parseTagResponse(mockMessage("", { stop_reason: "refusal" })), /Refused/);
  assert.throws(() => parseTagResponse(mockMessage('{"observed', { stop_reason: "max_tokens" })), /max_tokens/);
});

test("the output schema keeps enums and drops keywords structured outputs rejects", () => {
  const json = JSON.stringify(OUTPUT_FORMAT.schema);
  assert.match(json, /"enum":\["Stunning","Nice","Clear","Foggy","Wet"\]/);
  for (const keyword of ["minimum", "maximum", "pattern", "maxItems", "minLength", "$schema"]) {
    assert.ok(!json.includes(`"${keyword}"`), `${keyword} should be stripped`);
  }
});

test("the request references the uploaded file and caches the shared prefix", () => {
  const request = buildTagRequest("file_123", ["Telegraph Hill"]);
  const system = request.system as Anthropic.TextBlockParam[];
  assert.equal(system.at(-1)?.cache_control?.type, "ephemeral");
  assert.match(system.at(-1)!.text, /Telegraph Hill/);
  const content = request.messages[0].content as Anthropic.ContentBlockParam[];
  assert.deepEqual((content[0] as Anthropic.ImageBlockParam).source, { type: "file", file_id: "file_123" });
  // The image comes after the cached prefix, so it never invalidates it.
  assert.equal(request.output_config?.format, OUTPUT_FORMAT);
});
