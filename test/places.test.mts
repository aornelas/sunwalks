// Setting where a morning was from the web app: matching a name to the
// owner's spots, and picking a morning's suggestion from its photos.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgres://test@localhost/unused";
const { matchPlace, commonest } = await import("../src/lib/places");

const options = ["Crissy Field", "Telegraph Hill", "Twin Peaks", "Home"];

test("a place matches a spot whatever its case and spacing, and nothing else", () => {
  assert.equal(matchPlace("telegraph  hill", options), "Telegraph Hill");
  assert.equal(matchPlace("TwinPeaks", options), "Twin Peaks");
  assert.equal(matchPlace("home", options), "Home");
  assert.equal(matchPlace("Coit Tower", options), null, "a landmark that isn't a spot suggests nothing");
  assert.equal(matchPlace(null, options), null);
});

test("a morning's suggestion is its photos' most common place, ignoring blanks", () => {
  assert.equal(commonest(["Twin Peaks", null, "Twin Peaks", "Crissy Field"]), "Twin Peaks");
  assert.equal(commonest([null, null]), null);
  assert.equal(commonest([]), null);
});
