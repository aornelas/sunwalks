// The morning check-in's plain-TypeScript parts: whether a spot fits a
// morning, which schedule rule applies, owner-local times across daylight
// saving, dating a photo from its EXIF, and the rating-first walk score.
import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";

process.env.DATABASE_URL ??= "postgres://test@localhost/unused";
const { reachFor, HOME_TIMING } = await import("../src/lib/reach");
const { ruleForDate, DEFAULT_RULE } = await import("../src/lib/schedule");
const { wallClockToInstant, zonedTimeToInstant } = await import("../src/lib/dates");
const { takenAtFromExif } = await import("../src/lib/telegram-photos");
const { walkScore } = await import("../src/lib/place-scores");
import type { ScheduleRule } from "../src/lib/schedule";

const TZ = "America/Los_Angeles";

test("owner-local times land on the right instant either side of daylight saving", () => {
  // Friday Oct 30, 2026 is still PDT (UTC−7); Monday Nov 2 is PST (UTC−8).
  assert.equal(zonedTimeToInstant("2026-10-30", "07:50", TZ).toISOString(), "2026-10-30T14:50:00.000Z");
  assert.equal(zonedTimeToInstant("2026-11-02", "07:50", TZ).toISOString(), "2026-11-02T15:50:00.000Z");
  assert.equal(wallClockToInstant(new Date("2026-07-01T06:00:00Z"), TZ).toISOString(), "2026-07-01T13:00:00.000Z");
});

const schoolDay = { label: "school day", backBy: "07:50", stayMinutes: 5 };

test("a spot is in reach when sunrise, the stay, the walk and the trip home beat the deadline", () => {
  const sunrise = zonedTimeToInstant("2026-10-30", "07:33", TZ);
  const backBy = zonedTimeToInstant("2026-10-30", "07:50", TZ);

  const bridge = reachFor(sunrise, schoolDay, backBy, { minutesHome: 5, loopMinutes: 0 }, TZ);
  assert.equal(bridge.status, "in_reach");
  assert.equal(bridge.spareMinutes, 7); // 7:33 + 5 + 5 = 7:43
  assert.equal(bridge.reason, "home by 7:43 AM, 7 min before 7:50 AM");

  // McLaren: a 15-minute loop after sunrise, then 10 minutes home.
  const mclaren = reachFor(sunrise, schoolDay, backBy, { minutesHome: 10, loopMinutes: 15 }, TZ);
  assert.equal(mclaren.status, "too_far");
  assert.equal(mclaren.spareMinutes, -13); // 7:33 + 5 + 15 + 10 = 8:03
  assert.equal(mclaren.reason, "home at 8:03 AM, 13 min after 7:50 AM");

  assert.equal(reachFor(sunrise, schoolDay, backBy, HOME_TIMING, TZ).status, "in_reach");
  assert.equal(reachFor(sunrise, schoolDay, backBy, { minutesHome: null, loopMinutes: 0 }, TZ).status, "unknown");
});

test("the hour daylight saving gives back opens up farther spots on school days", () => {
  // Monday Nov 2: sunrise near 6:36 PST, the same 7:50 drop-off.
  const sunrise = zonedTimeToInstant("2026-11-02", "06:36", TZ);
  const backBy = zonedTimeToInstant("2026-11-02", "07:50", TZ);
  assert.equal(reachFor(sunrise, schoolDay, backBy, { minutesHome: 10, loopMinutes: 15 }, TZ).status, "in_reach");
});

test("with no time to be back, everything is in reach", () => {
  const sunrise = zonedTimeToInstant("2026-10-31", "07:34", TZ);
  const weekend = { label: "weekend", backBy: null, stayMinutes: 20 };
  const far = reachFor(sunrise, weekend, null, { minutesHome: 40, loopMinutes: 30 }, TZ);
  assert.equal(far.status, "in_reach");
  assert.equal(reachFor(sunrise, weekend, null, { minutesHome: null, loopMinutes: 0 }, TZ).status, "in_reach");
});

function rule(overrides: Partial<ScheduleRule>): ScheduleRule {
  return {
    id: 1,
    label: "school day",
    weekdays: [1, 2, 3, 4, 5],
    startDate: null,
    endDate: null,
    backBy: "07:50",
    stayMinutes: 5,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    ...overrides,
  };
}

test("dated rules beat the weekly pattern, and the newest of a sort wins", () => {
  const rules = [
    rule({}),
    rule({ id: 2, label: "weekend", weekdays: [0, 6], backBy: null, stayMinutes: 20 }),
    rule({ id: 3, label: "no school", weekdays: [0, 1, 2, 3, 4, 5, 6], startDate: "2026-11-11", endDate: "2026-11-11", backBy: null, stayMinutes: 20 }),
    rule({ id: 4, label: "late start", startDate: "2026-11-11", endDate: "2026-11-13", backBy: "08:30", createdAt: new Date("2026-09-01T00:00:00Z") }),
  ];
  assert.equal(ruleForDate(rules, "2026-11-02").label, "school day"); // a Monday
  assert.equal(ruleForDate(rules, "2026-10-31").label, "weekend"); // a Saturday
  assert.equal(ruleForDate(rules, "2026-11-11").label, "no school"); // both dated rules apply; the newer wins
  assert.equal(ruleForDate(rules, "2026-11-12").label, "late start");
  assert.deepEqual(ruleForDate([], "2026-11-02"), DEFAULT_RULE);
});

test("a photo sent as a file is dated by its EXIF, in the owner's zone unless it says otherwise", async () => {
  const withExif = (exif: Record<string, string>) =>
    sharp({ create: { width: 8, height: 8, channels: 3, background: "#f80" } })
      .jpeg()
      .withExif({ IFD2: exif })
      .toBuffer()
      .then((b) => sharp(b).metadata())
      .then((m) => m.exif);

  // A sunrise shot at 7:31 local on Oct 30, no offset tag: read as Pacific time.
  const local = await withExif({ DateTimeOriginal: "2026:10:30 07:31:12" });
  assert.equal(takenAtFromExif(local, TZ)?.toISOString(), "2026-10-30T14:31:12.000Z");
  // With an offset tag, that wins.
  const offset = await withExif({ DateTimeOriginal: "2026:10:30 07:31:12", OffsetTimeOriginal: "-04:00" });
  assert.equal(takenAtFromExif(offset, TZ)?.toISOString(), "2026-10-30T11:31:12.000Z");
  // A file with no date, and no EXIF at all.
  assert.equal(takenAtFromExif(await withExif({ Make: "x" }), TZ), null);
  assert.equal(takenAtFromExif(undefined, TZ), null);
});

test("the rating is the score; drama only stands in without one, and never for home", () => {
  assert.equal(walkScore({ rating: 4, drama: 10, stayedIn: false }), 0.75);
  assert.equal(walkScore({ rating: 2, drama: 10, stayedIn: false }), 0.25, "a great sky doesn't rescue the wrong spot");
  assert.equal(walkScore({ rating: null, drama: 10, stayedIn: false }), 1);
  assert.equal(walkScore({ rating: 5, drama: 2, stayedIn: true }), 1);
  assert.equal(walkScore({ rating: null, drama: 8, stayedIn: true }), null);
});
