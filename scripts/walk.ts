// Logs mornings and manages spots and the schedule from the command line
// (the Telegram walk buddy does the same from your phone):
//   npm run walk -- log 2026-10-30 "Telegraph Hill" --rating 5 --note "pink for twenty minutes"
//   npm run walk -- stayed-in 2026-10-31 --rating 4 --note "rain, good book"
//   npm run walk -- slept-in 2026-11-01
//   npm run walk -- add-spot "Glen Canyon" forest
//   npm run walk -- timing "McLaren Park" 10 --loop 15     10 min home from where you watch, a 15 min walk there
//   npm run walk -- spots
//   npm run walk -- schedule
//   npm run walk -- schedule-add "school day" --days 1,2,3,4,5 --back-by 07:50 --stay 5
//   npm run walk -- schedule-add "no school" --days 0,1,2,3,4,5,6 --from 2026-11-11 --stay 20
//   npm run walk -- schedule-remove 3
//   npm run walk -- reach [YYYY-MM-DD]                      which spots fit a morning (tomorrow by default)
import "dotenv/config";
import { formatTime } from "../src/lib/dates";
import { env } from "../src/lib/env";
import { STAY_IN, type SpotKind } from "../src/lib/place-scores";
import { planningStartDate } from "../src/lib/planning";
import { HOME_TIMING, reachFor } from "../src/lib/reach";
import { addRule, listRules, morningSchedule, removeRule } from "../src/lib/schedule";
import { addSpot, listSpots, logWalk, setSpotTiming } from "../src/lib/spots";

const KINDS: SpotKind[] = ["vantage", "forest", "short_walk", "waterfront"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function flag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : undefined;
}

function num(value: string | undefined): number | undefined {
  return value == null ? undefined : Number(value);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const rating = num(flag(args, "--rating"));
  const note = flag(args, "--note");
  switch (command) {
    case "log": {
      const [date, spot] = args;
      await logWalk({ date, spot, rating, note, source: "cli" });
      console.log(`Logged ${date}: ${spot}.`);
      break;
    }
    case "stayed-in": {
      const [date] = args;
      await logWalk({ date, stayedIn: true, rating, note, source: "cli" });
      console.log(`Logged ${date}: ${STAY_IN}.`);
      break;
    }
    case "slept-in": {
      const [date] = args;
      await logWalk({ date, sleptIn: true, note, source: "cli" });
      console.log(`Logged ${date}: slept in.`);
      break;
    }
    case "add-spot": {
      const [name, kind] = args;
      if (!KINDS.includes(kind as SpotKind)) throw new Error(`Kind must be one of: ${KINDS.join(", ")}`);
      const spot = await addSpot(name, kind as SpotKind, note);
      console.log(`Spot "${spot.name}" (${spot.kind}).`);
      break;
    }
    case "timing": {
      const [name, minutesHome] = args;
      const spot = await setSpotTiming(name, { minutesHome: Number(minutesHome), loopMinutes: num(flag(args, "--loop")) });
      console.log(`${spot.name}: ${spot.minutesHome} min home, ${spot.loopMinutes} min walk there.`);
      break;
    }
    case "spots":
      for (const s of await listSpots()) {
        const timing = s.minutesHome != null ? `${s.minutesHome} min home${s.loopMinutes ? `, ${s.loopMinutes} min walk` : ""}` : "timing not set";
        console.log(`${s.name} (${s.kind}; ${timing})${s.notes ? `: ${s.notes}` : ""}`);
      }
      break;
    case "schedule":
      for (const r of await listRules()) {
        const when = r.startDate ? `${r.startDate}${r.endDate !== r.startDate ? ` to ${r.endDate}` : ""}` : "every week";
        console.log(
          `${r.id}  ${r.label}: ${r.weekdays.map((d) => WEEKDAYS[d]).join(" ")}, ${when}; ${r.backBy ? `back by ${r.backBy}` : "no time to be back"}, stay ${r.stayMinutes} min`,
        );
      }
      break;
    case "schedule-add": {
      const [label] = args;
      const days = flag(args, "--days");
      const stay = num(flag(args, "--stay"));
      if (!label || !days || stay == null) throw new Error('Usage: schedule-add "label" --days 1,2,3,4,5 [--back-by HH:MM] --stay N [--from YYYY-MM-DD] [--to YYYY-MM-DD]');
      const rule = await addRule({
        label,
        weekdays: days.split(",").map(Number),
        backBy: flag(args, "--back-by") ?? null,
        stayMinutes: stay,
        startDate: flag(args, "--from") ?? null,
        endDate: flag(args, "--to") ?? null,
      });
      console.log(`Added rule ${rule.id}: ${rule.label}.`);
      break;
    }
    case "schedule-remove": {
      const id = Number(args[0]);
      console.log((await removeRule(id)) ? `Removed rule ${id}.` : `No rule ${id}.`);
      break;
    }
    case "reach": {
      const date = args[0] ?? planningStartDate();
      const { rule, backBy, sunrise } = await morningSchedule(date);
      console.log(
        `${date}: sunrise ${formatTime(sunrise, env.timezone)}; ${rule.label}, ${rule.backBy ? `back by ${rule.backBy}` : "no time to be back"}, stay ${rule.stayMinutes} min`,
      );
      const timings = [...(await listSpots()).map((s) => [s.name, s] as const), [STAY_IN, HOME_TIMING] as const];
      for (const [name, timing] of timings) {
        const r = reachFor(sunrise, rule, backBy, timing, env.timezone);
        console.log(`  ${r.status === "in_reach" ? "✓" : r.status === "too_far" ? "✗" : "?"} ${name}: ${r.reason}`);
      }
      break;
    }
    default:
      throw new Error("Commands: log, stayed-in, slept-in, add-spot, timing, spots, schedule, schedule-add, schedule-remove, reach");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
