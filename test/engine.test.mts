// The engine's plain-TypeScript half (calibration and place scores) and
// the tool loop, with the Claude API replaced by a scripted fake.
import { test } from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";

process.env.DATABASE_URL ??= "postgres://test@localhost/unused";
const { computeCalibration, describeConfidence, observedDistribution } = await import("../src/lib/calibration");
const { computeSpotScores, rankSpots, walkScore, STAY_IN } = await import("../src/lib/place-scores");
const { runToolLoop } = await import("../src/lib/tool-loop");
import type { MorningRecord } from "../src/lib/mornings";

function morning(overrides: Partial<MorningRecord>): MorningRecord {
  return {
    date: "2026-05-01",
    forecast: null,
    forecastSource: "historical",
    ceilingFt: null,
    snapshot: null,
    observed: null,
    drama: null,
    spot: null,
    stayedIn: false,
    sleptIn: false,
    rating: null,
    note: null,
    ...overrides,
  };
}

test("calibration counts how often each forecast held", () => {
  const cal = computeCalibration([
    morning({ forecast: "Foggy", observed: "Foggy" }),
    morning({ forecast: "Foggy", observed: "Foggy" }),
    morning({ forecast: "Foggy", observed: "Nice" }),
    morning({ forecast: "Stunning", observed: "Nice" }),
    morning({ forecast: "Clear" }), // no photo: not compared
  ]);
  const foggy = cal.byCategory.find((c) => c.category === "Foggy")!;
  assert.equal(cal.compared, 4);
  assert.equal(cal.held, 2);
  assert.equal(foggy.forecasts, 3);
  assert.equal(foggy.held, 2);
  assert.equal(foggy.confidence, 3 / 5); // (held + 1) / (n + 2)
  assert.deepEqual(foggy.turnedOut, [{ category: "Nice", count: 1 }]);
  assert.equal(describeConfidence(foggy), "2 of 3 Foggy forecasts held");
  assert.match(describeConfidence(cal.byCategory.find((c) => c.category === "Stunning")!), /too few/);
});

test("with no history, the forecast is mostly trusted", () => {
  const odds = observedDistribution(computeCalibration([]), "Foggy");
  assert.ok(odds.Foggy > 0.6);
  assert.ok(Math.abs(Object.values(odds).reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test("a walk's score blends rating and drama, and staying in ignores drama", () => {
  assert.equal(walkScore({ rating: 5, drama: 10, stayedIn: false }), 1);
  assert.equal(walkScore({ rating: 1, drama: null, stayedIn: false }), 0);
  assert.equal(walkScore({ rating: 3, drama: 10, stayedIn: true }), 0.5);
  assert.equal(walkScore({ rating: null, drama: null, stayedIn: false }), null);
});

test("spots start from their kind's default and move with the walks logged there", () => {
  const spots = [
    { name: "Hill", kind: "vantage" as const },
    { name: "Woods", kind: "forest" as const },
  ];
  const fresh = computeSpotScores(spots, []);
  const ranked = rankSpots(fresh, observedDistribution(computeCalibration([]), "Foggy"), "Foggy");
  assert.equal(ranked[0].spot, "Woods"); // forest beats a hilltop in fog by default
  assert.ok(ranked.some((s) => s.spot === STAY_IN));

  // Three great foggy mornings on the hill overturn the default.
  const history = [1, 2, 3].map((d) =>
    morning({ date: `2026-05-0${d}`, forecast: "Foggy", observed: "Foggy", spot: "Hill", rating: 5, drama: 9 }),
  );
  const learned = computeSpotScores(spots, history);
  const again = rankSpots(learned, observedDistribution(computeCalibration(history), "Foggy"), "Foggy");
  assert.equal(again[0].spot, "Hill");
  assert.equal(again[0].walksUnderSky, 3);
});

/** A stand-in for the SDK client that replays scripted responses and records each request. */
function scriptedClient(responses: Partial<Anthropic.Message>[]) {
  const requests: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const client = {
    messages: {
      async create(params: Anthropic.MessageCreateParamsNonStreaming) {
        // Snapshot: the loop keeps appending to the same messages array.
        requests.push(structuredClone(params));
        const next = responses.shift();
        if (!next) throw new Error("No scripted response left");
        return {
          id: "msg",
          type: "message",
          role: "assistant",
          model: "claude-opus-5-5",
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 0 },
          ...next,
        };
      },
    },
  } as unknown as Anthropic;
  return { client, requests };
}

test("the tool loop runs every requested tool and returns the results together", async () => {
  const { client, requests } = scriptedClient([
    {
      stop_reason: "tool_use",
      content: [
        { type: "tool_use", id: "t1", name: "double", input: { n: 2 }, caller: { type: "direct" } },
        { type: "tool_use", id: "t2", name: "broken", input: {}, caller: { type: "direct" } },
      ] as Anthropic.ContentBlock[],
    },
    { stop_reason: "end_turn", content: [{ type: "text", text: "done", citations: null }] },
  ]);
  const calls: string[] = [];
  const result = await runToolLoop(client, {
    model: "claude-opus-5-5",
    system: "test",
    prompt: "go",
    tools: [
      {
        definition: { name: "double", input_schema: { type: "object" } },
        run: async (input) => ({ result: (input as { n: number }).n * 2 }),
      },
      {
        definition: { name: "broken", input_schema: { type: "object" } },
        run: async () => {
          throw new Error("no data");
        },
      },
    ],
    onToolCall: (e) => calls.push(e.tool),
  });

  assert.equal(result.turns, 2);
  assert.deepEqual(calls, ["double", "broken"]);
  assert.equal(result.usage.cacheReadTokens, 200);
  // Both results went back in one user message; the failure as is_error.
  const followUp = requests[1].messages.at(-1)!;
  assert.equal(followUp.role, "user");
  const results = followUp.content as Anthropic.ToolResultBlockParam[];
  assert.deepEqual(results.map((r) => [r.tool_use_id, r.content, r.is_error]), [
    ["t1", '{"result":4}', false],
    ["t2", "no data", true],
  ]);
  assert.equal(requests[0].cache_control?.type, "ephemeral");
});

test("the tool loop gives up instead of looping forever", async () => {
  const toolTurn = {
    stop_reason: "tool_use" as const,
    content: [{ type: "tool_use", id: "t", name: "noop", input: {}, caller: { type: "direct" } }] as Anthropic.ContentBlock[],
  };
  const { client } = scriptedClient([toolTurn, toolTurn, toolTurn]);
  await assert.rejects(
    runToolLoop(client, {
      model: "m",
      system: "s",
      prompt: "p",
      tools: [{ definition: { name: "noop", input_schema: { type: "object" } }, run: async () => ({}) }],
      maxTurns: 2,
    }),
    /No answer after 2 turns/,
  );
});
