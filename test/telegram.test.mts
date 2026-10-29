// The walk buddy's Telegram side with no network: the webhook's checks,
// the button encoding, the morning report and its buttons, and the weekly
// summary, plus the Bot API client against a fake fetch.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgres://test@localhost/unused";
const { decodeButton, encodeButton, imageOf, isFromOwner, largestPhoto, secretMatches, telegramApi } = await import("../src/lib/telegram");
const { headingOf, isComplete, kindOf, placeKeyboard, planMessage, reportStatus, weeklySummaryText, withStatus } = await import(
  "../src/lib/walk-buddy"
);
const { STAY_IN } = await import("../src/lib/place-scores");
import type { ButtonAction, TelegramUpdate } from "../src/lib/telegram";
import type { MorningRecord } from "../src/lib/mornings";
import type { Recommendation } from "../src/lib/recommend";
import type { Spot } from "../src/lib/spots";
import type { MorningReport } from "../src/lib/walk-buddy";

test("the webhook secret must match exactly", () => {
  assert.equal(secretMatches("s3cret", "s3cret"), true);
  assert.equal(secretMatches("s3cre", "s3cret"), false);
  assert.equal(secretMatches("S3CRET", "s3cret"), false);
  assert.equal(secretMatches(null, "s3cret"), false);
});

test("only the owner's chat gets through", () => {
  const message = (chatId: number): TelegramUpdate => ({
    update_id: 1,
    message: { message_id: 1, date: 0, chat: { id: chatId, type: "private" }, text: "hi" },
  });
  assert.equal(isFromOwner(message(42), "42"), true);
  assert.equal(isFromOwner(message(43), "42"), false);
  const tap: TelegramUpdate = {
    update_id: 2,
    callback_query: { id: "q", from: { id: 42, first_name: "A" }, data: "s:2026-10-30", message: message(42).message },
  };
  assert.equal(isFromOwner(tap, "42"), true);
  assert.equal(isFromOwner({ update_id: 3 }, "42"), false, "an update with no chat is dropped");
});

test("buttons round-trip and reject anything malformed", () => {
  const actions: ButtonAction[] = [
    { kind: "walk", date: "2026-10-30", spotId: 12 },
    { kind: "stay", date: "2026-10-30" },
    { kind: "slept", date: "2026-10-30" },
    { kind: "rate", date: "2026-10-30", rating: 4 },
  ];
  for (const action of actions) {
    const data = encodeButton(action);
    assert.ok(Buffer.byteLength(data) <= 64, "callback_data is capped at 64 bytes");
    assert.deepEqual(decodeButton(data), action);
  }
  for (const bad of [undefined, "", "w:2026-10-30", "r:2026-10-30:6", "r:2026-10-30:0", "s:2026-10-30:1", "z:2026-10-30:1", "x:2026-10-30:1", "w:20261030:1"]) {
    assert.equal(decodeButton(bad), null, `${bad} should be rejected`);
  }
});

function spot(id: number, name: string): Spot {
  return { id, name, kind: "vantage", notes: null, lat: null, lon: null, minutesHome: null, loopMinutes: 0, createdAt: new Date(0) };
}

const rec: Recommendation = {
  category: "Foggy",
  confidence: 0.8,
  confidence_note: "7 of 9 Foggy forecasts held",
  spot: "Glen Canyon",
  reason: "Fog suits the forest.",
  alternatives: [{ spot: "Twin Peaks", reason: "Might be above it." }],
  message: "Foggy tomorrow, marine layer at 900 ft. Glen Canyon.",
};

test("the evening plan is just text: a suggestion, not a question", () => {
  assert.equal(planMessage("2026-10-30", rec), "Fri 30: Foggy tomorrow, marine layer at 900 ft. Glen Canyon.");
});

test("the place buttons put last night's suggestions first and Home last, two to a row", () => {
  const spots = [spot(1, "Bernal Hill"), spot(2, "Glen Canyon"), spot(3, "Twin Peaks")];
  const keyboard = placeKeyboard("2026-10-30", spots, ["Twin Peaks", "Glen Canyon", STAY_IN, "Gone Spot"]);
  assert.deepEqual(
    keyboard.inline_keyboard.map((row) => row.map((b) => b.text)),
    [["Twin Peaks", "Glen Canyon"], ["Bernal Hill", STAY_IN]],
  );
  assert.deepEqual(decodeButton(keyboard.inline_keyboard[0][0].callback_data), { kind: "walk", date: "2026-10-30", spotId: 3 });
  assert.deepEqual(decodeButton(keyboard.inline_keyboard[1][1].callback_data), { kind: "stay", date: "2026-10-30" });
});

function report(overrides: Partial<MorningReport>): MorningReport {
  return { date: "2026-10-30", photos: 0, place: null, sleptIn: false, rating: null, note: null, ...overrides };
}

test("a report needs a photo, a place and a rating, and says what's missing", () => {
  assert.equal(isComplete(report({ photos: 1, place: "Bernal Hill", rating: 4 })), true);
  assert.equal(isComplete(report({ photos: 1, place: STAY_IN, rating: 5 })), true);
  assert.equal(isComplete(report({ sleptIn: true })), true, "slept in is a whole answer");
  assert.equal(isComplete(report({ photos: 0, place: "Bernal Hill", rating: 4 })), false);

  assert.equal(reportStatus(report({ photos: 1 })), "Where were you?");
  assert.equal(reportStatus(report({ photos: 1, place: "Bernal Hill" })), "Bernal Hill. How was it?");
  assert.equal(reportStatus(report({ place: STAY_IN, rating: 5 })), "Home, 5 of 5. Send the photo when you can.");
  assert.equal(reportStatus(report({ photos: 2, place: "Bernal Hill", rating: 4 })), "Bernal Hill, 4 of 5.");
  assert.equal(reportStatus(report({ sleptIn: true })), "Slept in.");
});

test("a tap's status line replaces the previous one", () => {
  const once = withStatus("Fri 30: got it, a foggy sky.", "Where were you?");
  const twice = withStatus(once, "Glen Canyon. How was it?");
  assert.equal(twice, "Fri 30: got it, a foggy sky.\n\n✓ Glen Canyon. How was it?");
  assert.equal(headingOf(twice), "Fri 30: got it, a foggy sky.");
});

test("updates are classified for the log, and images sent as files count as photos", () => {
  const base = { message_id: 1, date: 0, chat: { id: 1, type: "private" } };
  assert.equal(kindOf({ update_id: 1, message: { ...base, text: "/plan" } }), "command");
  assert.equal(kindOf({ update_id: 1, message: { ...base, text: "went to Crissy" } }), "text");
  assert.equal(kindOf({ update_id: 1, message: { ...base, photo: [{ file_id: "a", file_unique_id: "b", width: 1, height: 1 }] } }), "photo");
  const asFile = { ...base, document: { file_id: "d", file_unique_id: "du", mime_type: "image/jpeg", file_name: "PXL_1.jpg" } };
  assert.equal(kindOf({ update_id: 1, message: asFile }), "photo");
  assert.deepEqual(imageOf(asFile), { fileId: "d", uniqueId: "du", original: true });
  assert.equal(imageOf({ ...base, document: { file_id: "p", file_unique_id: "pu", mime_type: "application/pdf" } }), null);
  assert.equal(kindOf({ update_id: 1, callback_query: { id: "q", from: { id: 1, first_name: "A" } } }), "button");
});

test("the largest photo size is the one downloaded", () => {
  const sizes = [
    { file_id: "s", file_unique_id: "s", width: 90, height: 60 },
    { file_id: "l", file_unique_id: "l", width: 1280, height: 853 },
    { file_id: "m", file_unique_id: "m", width: 320, height: 213 },
  ];
  assert.equal(largestPhoto(sizes).file_id, "l");
});

function morning(overrides: Partial<MorningRecord>): MorningRecord {
  return {
    date: "2026-10-25",
    forecast: null,
    forecastSource: "live",
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

test("the weekly summary counts the seven mornings before today", () => {
  const text = weeklySummaryText(
    "2026-11-01",
    [
      morning({ date: "2026-10-10", forecast: "Foggy", observed: "Foggy" }), // before the week: overall only
      morning({ date: "2026-10-26", forecast: "Foggy", observed: "Foggy", spot: "Glen Canyon", rating: 4 }),
      morning({ date: "2026-10-28", forecast: "Stunning", observed: "Nice", spot: "Twin Peaks", rating: 5 }),
      morning({ date: "2026-10-30", forecast: "Wet", stayedIn: true }),
      morning({ date: "2026-10-31", sleptIn: true }),
      morning({ date: "2026-11-01", spot: "Twin Peaks", rating: 1 }), // today: not yet part of the week
    ],
    ["/memories/preferences.md"],
  );
  const lines = text.split("\n");
  assert.equal(lines[0], "What I learned, Oct 25 – 31");
  assert.equal(lines[1], "2 mornings out, 1 at home, 1 slept in; 3 unreported. Average rating 4.5 of 5.");
  assert.equal(lines[2], "Best: Wed 28, at Twin Peaks, 5 of 5.");
  assert.equal(lines[3], "This week's forecasts held on 1 of 2 mornings with a photo.");
  assert.match(lines[4], /^So far: 0 of 1 Stunning forecasts held \(too few to go on\); 2 of 2 Foggy forecasts held \(too few to go on\)\.$/);
  assert.equal(lines[5], "Preferences updated: preferences.md.");
});

test("the Bot API client posts JSON and surfaces Telegram's errors", async () => {
  const calls: { url: string; body: unknown }[] = [];
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (url.endsWith("/sendMessage")) return Response.json({ ok: true, result: { message_id: 7 } });
    if (url.includes("/file/")) return new Response(Buffer.from("jpeg"));
    return Response.json({ ok: false, description: "Bad Request: chat not found" }, { status: 400 });
  }) as typeof fetch;
  const api = telegramApi("TOKEN", { base: "https://tg.test", fetch: fakeFetch });

  assert.deepEqual(await api.call("sendMessage", { chat_id: 1, text: "hi" }), { message_id: 7 });
  assert.equal(calls[0].url, "https://tg.test/botTOKEN/sendMessage");
  assert.deepEqual(calls[0].body, { chat_id: 1, text: "hi" });
  await assert.rejects(api.call("getChat", { chat_id: 2 }), /getChat failed: Bad Request: chat not found/);
  assert.equal((await api.download("photos/file_1.jpg")).toString(), "jpeg");
  assert.equal(calls[2].url, "https://tg.test/file/botTOKEN/photos/file_1.jpg");
});
