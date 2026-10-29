// Logs mornings and manages spots from the command line, until the
// Telegram bot and the MCP server do it for you:
//   npm run walk -- log 2026-10-30 "Telegraph Hill" --rating 5 --note "pink for twenty minutes"
//   npm run walk -- stayed-in 2026-10-31 --note "rain, good book"
//   npm run walk -- add-spot "Glen Canyon" forest
//   npm run walk -- spots
import "dotenv/config";
import { addSpot, listSpots, logWalk } from "../src/lib/spots";
import type { SpotKind } from "../src/lib/place-scores";

const KINDS: SpotKind[] = ["vantage", "forest", "short_walk", "waterfront"];

function flag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : undefined;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const rating = flag(args, "--rating");
  const note = flag(args, "--note");
  switch (command) {
    case "log": {
      const [date, spot] = args;
      await logWalk({ date, spot, rating: rating ? Number(rating) : undefined, note, source: "cli" });
      console.log(`Logged ${date}: ${spot}.`);
      break;
    }
    case "stayed-in": {
      const [date] = args;
      await logWalk({ date, stayedIn: true, rating: rating ? Number(rating) : undefined, note, source: "cli" });
      console.log(`Logged ${date}: stayed in.`);
      break;
    }
    case "add-spot": {
      const [name, kind] = args;
      if (!KINDS.includes(kind as SpotKind)) throw new Error(`Kind must be one of: ${KINDS.join(", ")}`);
      const spot = await addSpot(name, kind as SpotKind, note);
      console.log(`Spot "${spot.name}" (${spot.kind}).`);
      break;
    }
    case "spots":
      for (const s of await listSpots()) console.log(`${s.name} (${s.kind})${s.notes ? `: ${s.notes}` : ""}`);
      break;
    default:
      throw new Error("Commands: log, stayed-in, add-spot, spots");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
