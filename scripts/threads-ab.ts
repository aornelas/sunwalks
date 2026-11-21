// Measures what message threads do for the tool loop: plans the same
// mornings with threads off and on, alternating the order, and compares
// the turns after the first, where a thread should send only the new
// messages. Every run calls the Claude API (billed). Runs are dry: the plan
// isn't stored and memory is read-only, so nothing in the database changes.
//
//   npm run threads-ab -- --runs 10 [--date YYYY-MM-DD] [--out results.json]
//
// --runs is the number of mornings, each planned once per arm, going back
// a day at a time from --date (default: the next morning to plan).
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { createClaudeClient } from "../src/lib/claude-client";
import { addDays } from "../src/lib/dates";
import { planningStartDate } from "../src/lib/planning";
import { recommendModel, recommendWalk } from "../src/lib/recommend";
import type { LoopTrace } from "../src/lib/tool-loop";

interface Run {
  date: string;
  threaded: boolean;
  ok: boolean;
  error?: string;
  ms: number;
  turns: number;
  usage?: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number };
  trace?: LoopTrace;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

// Claude Opus 5.5 list prices per million tokens; cache writes at 1.25x input.
const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
};

function summarize(runs: Run[], threaded: boolean) {
  const arm = runs.filter((r) => r.threaded === threaded);
  const ok = arm.filter((r) => r.ok && r.trace);
  // Turns after the first: one entry per turn, all its requests together.
  const later = ok.flatMap((r) => r.trace!.turns.filter((t) => t.turn > 1));
  const replays = later.filter((t) => t.requests.length > 1 || t.requests.some((q) => q.thread === "create")).length;
  const unthreaded = threaded ? later.filter((t) => t.requests.every((q) => q.thread === "none")).length : 0;
  const ms = later.map((t) => t.requests.reduce((s, q) => s + q.ms, 0));
  const bytes = later.map((t) => t.requests.reduce((s, q) => s + q.bytes, 0));
  const tokens = ok.reduce(
    (s, r) => ({
      input: s.input + r.usage!.inputTokens,
      output: s.output + r.usage!.outputTokens,
      cacheRead: s.cacheRead + r.usage!.cacheReadTokens,
      cacheWrite: s.cacheWrite + r.usage!.cacheCreationTokens,
    }),
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  );
  const price = PRICES[recommendModel()];
  const cost = price
    ? (tokens.input * price.input + tokens.output * price.output + tokens.cacheRead * price.cacheRead + tokens.cacheWrite * price.cacheWrite) / 1e6
    : null;
  return {
    arm: threaded ? "threads on" : "threads off",
    runs: arm.length,
    failed: arm.length - ok.length,
    laterTurns: later.length,
    medianTurns: quantile(ok.map((r) => r.turns), 0.5),
    laterTurnMs: { median: quantile(ms, 0.5), p90: quantile(ms, 0.9) },
    laterTurnBytes: { median: quantile(bytes, 0.5), p90: quantile(bytes, 0.9) },
    runMs: { median: quantile(ok.map((r) => r.ms), 0.5) },
    replays,
    unthreadedLaterTurns: unthreaded,
    tokens,
    costUsd: cost === null ? null : Math.round(cost * 100) / 100,
  };
}

async function main() {
  const runs = Number(arg("runs") ?? 10);
  const start = arg("date") ?? planningStartDate();
  if (!Number.isInteger(runs) || runs < 1) throw new Error("--runs takes a positive whole number");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new Error("--date takes YYYY-MM-DD");

  const client = createClaudeClient();
  const results: Run[] = [];
  for (let i = 0; i < runs; i++) {
    const date = addDays(start, -i);
    // Alternate which arm goes first, so a slow minute doesn't land on one arm.
    for (const threaded of i % 2 === 0 ? [false, true] : [true, false]) {
      process.env.CLAUDE_MESSAGE_THREADS = threaded ? "1" : "0";
      const started = performance.now();
      try {
        const { turns, usage, trace } = await recommendWalk(client, date, undefined, { dryRun: true });
        results.push({ date, threaded, ok: true, ms: Math.round(performance.now() - started), turns, usage, trace });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        results.push({ date, threaded, ok: false, error, ms: Math.round(performance.now() - started), turns: 0 });
      }
      const last = results.at(-1)!;
      console.log(`${date} threads ${threaded ? "on " : "off"}  ${last.ok ? `${last.turns} turns, ${last.ms} ms` : `failed: ${last.error}`}`);
    }
  }

  const summary = [summarize(results, false), summarize(results, true)];
  console.log(`\n${JSON.stringify(summary, null, 2)}`);
  const out = arg("out");
  if (out) writeFileSync(out, JSON.stringify({ model: recommendModel(), start, summary, results }, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
