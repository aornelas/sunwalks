import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgres://test@localhost/unused";
const { normalizePlace, readSamplePhoto } = await import("../src/lib/photo-source");
const { withFacet } = await import("../src/lib/facets");
import type { DayData } from "../src/lib/types";

test("places are normalised so one spot isn't counted twice", () => {
  assert.equal(normalizePlace("  Telegraph   Hill "), "Telegraph Hill");
  assert.equal(normalizePlace("   "), null);
  assert.equal(normalizePlace(undefined), null);
});

test("sample photos are readable, and filenames can't leave the folder", async () => {
  const bytes = await readSamplePhoto("1.jpg", "full");
  assert.ok(bytes && bytes.length > 0);
  assert.equal(bytes![0], 0xff); // JPEG magic
  assert.equal(await readSamplePhoto("../../package.json", "full"), null);
});

function day(date: string, shots: DayData["shots"]): DayData {
  return { date, shots, dayShotId: shots[0]?.id ?? null };
}

function shot(id: string, category?: DayData["shots"][number]["category"], place?: string) {
  return { id, url: "", thumbUrl: "", takenAt: "2026-05-01T13:00:00Z", category, place };
}

test("the facet filter keeps only matching shots, and drops days with none", () => {
  const days = new Map<string, DayData>([
    ["2026-05-01", day("2026-05-01", [shot("a", "Foggy", "Forest loop"), shot("b", "Nice", "Telegraph Hill")])],
    ["2026-05-02", day("2026-05-02", [shot("c", "Stunning", "Telegraph Hill")])],
  ]);
  const getDay = (d: string) => days.get(d);

  const foggy = withFacet(getDay, { category: "Foggy", place: null });
  assert.deepEqual(foggy("2026-05-01")?.shots.map((s) => s.id), ["a"]);
  assert.equal(foggy("2026-05-02"), undefined);

  const hill = withFacet(getDay, { category: null, place: "Telegraph Hill" });
  assert.equal(hill("2026-05-01")?.dayShotId, "b"); // the day shot moves to a matching one
  assert.equal(hill("2026-05-02"), days.get("2026-05-02")); // unchanged days keep their identity
  assert.equal(hill("2026-05-01"), hill("2026-05-01")); // memoised

  assert.equal(withFacet(getDay, { category: null, place: null }), getDay);
});
