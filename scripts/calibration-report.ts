// The calibration report, which doubles as the backtest: for every past
// morning with both a forecast and a tagged photo, did the forecast hold?
// Then which spots have worked for which skies, and the preferences Claude
// has filed. No model calls; `npm run calibration`.
import "dotenv/config";
import { computeCalibration, describeConfidence, MIN_SAMPLE } from "../src/lib/calibration";
import { allMemories } from "../src/lib/memory-store";
import { loadMornings } from "../src/lib/mornings";
import { computeSpotScores } from "../src/lib/place-scores";
import { listSpots } from "../src/lib/spots";
import { CATEGORY_ORDER } from "../src/lib/verdict";

const pct = (n: number | null) => (n == null ? "  –" : `${Math.round(n * 100)}%`.padStart(4));
const cell = (s: string | number, width = 9) => String(s).padStart(width);

async function main() {
  const [mornings, spotList, memories] = await Promise.all([loadMornings(), listSpots(), allMemories()]);
  const cal = computeCalibration(mornings);

  console.log("FORECAST CALIBRATION (backtest)");
  console.log(
    `${cal.compared} mornings with both a forecast and a tagged photo ` +
      `(${cal.sources.live} live evening-before, ${cal.sources.historical} historical). ` +
      `Overall the forecast held ${cal.held} times (${pct(cal.compared ? cal.held / cal.compared : null).trim()}).\n`,
  );
  for (const c of cal.byCategory) {
    const instead = c.turnedOut.map((t) => `${t.category} ${t.count}`).join(", ");
    console.log(`  ${c.category.padEnd(9)} ${pct(c.heldRate)}  ${describeConfidence(c)}${instead ? `; otherwise ${instead}` : ""}`);
  }

  console.log("\n  Forecast ↓ / observed →");
  console.log(`  ${"".padEnd(9)}${CATEGORY_ORDER.map((c) => cell(c)).join("")}`);
  for (const f of CATEGORY_ORDER) {
    console.log(`  ${f.padEnd(9)}${CATEGORY_ORDER.map((o) => cell(cal.confusion[f][o] || "·")).join("")}`);
  }
  const thin = cal.byCategory.filter((c) => c.forecasts > 0 && c.forecasts < MIN_SAMPLE).map((c) => c.category);
  if (thin.length) console.log(`\n  Under ${MIN_SAMPLE} mornings so far: ${thin.join(", ")}.`);

  console.log("\nPLACES (score 0–100 by observed sky; walks in brackets; no brackets = the kind's default)");
  console.log(`  ${"".padEnd(18)}${CATEGORY_ORDER.map((c) => cell(c, 11)).join("")}`);
  for (const s of computeSpotScores(spotList, mornings)) {
    const row = CATEGORY_ORDER.map((c) => {
      const { score, walks } = s.bySky[c];
      return cell(`${Math.round(score * 100)}${walks ? ` (${walks})` : ""}`, 11);
    }).join("");
    console.log(`  ${s.spot.padEnd(18)}${row}`);
  }

  console.log("\nPREFERENCES (Claude's memory)");
  if (memories.length === 0) console.log("  None filed yet. Try: npm run feedback -- \"...\"");
  for (const m of memories) console.log(`  ${m.path}\n${m.content.replace(/^/gm, "    ")}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
