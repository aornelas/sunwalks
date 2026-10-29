// Tells the engine something about your walks, in your own words:
//   npm run feedback -- "Telegraph Hill is perfect for Stunning days"
// Claude files it as a preference (its memory tool, stored in the
// database), and the recommender applies it from then on.
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { fileFeedback } from "../src/lib/feedback";

async function main() {
  const text = process.argv.slice(2).join(" ").trim();
  if (!text) throw new Error('Usage: npm run feedback -- "what you want the planner to know"');
  const { summary, usage } = await fileFeedback(new Anthropic(), text, (e) => {
    const input = e.input as { command?: string; path?: string };
    console.log(`  memory ${input.command} ${input.path ?? ""}${e.error ? `  ✗ ${e.error}` : ""}`);
  });
  console.log(summary);
  console.log(`(input ${usage.inputTokens} + ${usage.cacheReadTokens} cache read; output ${usage.outputTokens})`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
