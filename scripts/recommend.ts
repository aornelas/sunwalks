// Plans a morning's walk with the engine and prints how it got there: each
// tool Claude called, the plan itself, and the tokens it took.
// `npm run recommend` plans the next morning; `-- --date YYYY-MM-DD` any other.
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { planningStartDate } from "../src/lib/planning";
import { recommendWalk } from "../src/lib/recommend";

async function main() {
  const idx = process.argv.indexOf("--date");
  const date = idx >= 0 ? process.argv[idx + 1] : planningStartDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) throw new Error("--date takes YYYY-MM-DD");

  console.log(`Planning the walk for ${date}…`);
  const { recommendation: r, turns, usage } = await recommendWalk(new Anthropic(), date, (e) => {
    const input = JSON.stringify(e.input);
    console.log(`  [turn ${e.turn}] ${e.tool} ${input.length > 90 ? `${input.slice(0, 90)}…` : input}${e.error ? `  ✗ ${e.error}` : ""}`);
  });

  console.log(`\n${r.message}\n`);
  console.log(`Category:   ${r.category} (confidence ${r.confidence}: ${r.confidence_note})`);
  console.log(`Spot:       ${r.spot}: ${r.reason}`);
  for (const alt of r.alternatives) console.log(`Or:         ${alt.spot}: ${alt.reason}`);
  console.log(
    `\n${turns} turns; input ${usage.inputTokens} uncached + ${usage.cacheReadTokens} cache read + ${usage.cacheCreationTokens} cache write; output ${usage.outputTokens}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
