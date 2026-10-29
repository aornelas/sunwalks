# Architecture: the Claude layer

The README covers the calendar itself. This page covers what sits on top of
it: the photo-source interface, vision tagging, the forecast record they're
compared against, the engine that turns all three into a plan for
tomorrow's walk, and the Telegram walk buddy that delivers the plan and
collects what happened. The MCP server on the roadmap is a second way to
reach the same engine.

```
            ┌───────────────── PhotoSource ─────────────────┐
            │ listPhotos · getPhoto · getImage ·            │
            │ getMetadata · setMetadata (place)             │
            └──────┬───────────────────────────┬────────────┘
   Google Photos imports (today)        the phone itself (Android, later)
                   │
                   ▼
   npm run tag-photos ──▶ Files API (each photo uploaded once)
                   │            │
                   │            ▼
                   └──▶ Messages API / Message Batches
                         prompts/tag-photo/v1.md + JSON schema
                                │
                                ▼
                          photo_tags ──────────────┐
                                                   ▼
   nightly cron ──▶ forecast_snapshots (live) ──▶ the engine
   npm run backfill-forecasts ──▶ forecast_snapshots (historical)
```

## The photo-source interface

`src/lib/photo-source.ts` is the only thing that knows where photos live.
Code that needs a photo's bytes or metadata (the image route, tagging) asks
`getPhotoSource()` for it rather than reading the database or Blob storage
directly.

| Method | Returns |
| --- | --- |
| `listPhotos(range?)` | photos oldest first, optionally within a day-key range |
| `getPhoto(id)` | one photo's date, time taken, size and place |
| `getImage(id, size)` | JPEG bytes of the `sq` (480px square) or `full` (1600px) derivative |
| `getMetadata(id)` / `setMetadata(id, patch)` | the metadata the app writes back, which today is just `place` |

There are two implementations today: Google Photos imports (rows in
`photos`, bytes in Vercel Blob) and demo mode (seeded rows, bytes from
`public/seed-photos/`). The Android port adds a third that reads the
device's own photos. It implements the same five methods, so nothing in
the Claude layer changes.

**Place** is the one piece of metadata the app writes. The Picker API gives
no GPS, so a place comes from the owner, or from a Claude suggestion the
owner confirms. Places are location data: they live only in the database,
never in committed files, and the share link never receives them (its
routes call `getDaysInRange(..., { includePlace: false })`). Demo places are
public landmarks, names only.

## Vision tagging

`src/lib/tagging.ts` sends each photo to Claude with the prompt in
`prompts/tag-photo/v1.md` and gets back:

| Field | Used for |
| --- | --- |
| `observed_category` + `category_confidence` | Calibration: the sky the morning actually had, in the forecast's own five words (Stunning, Nice, Clear, Foggy, Wet), to compare with `forecast_snapshots` |
| `suggested_place` + `landmarks` | Place affinity: a suggestion from visible landmarks, reusing the owner's place names when one fits |
| `alt_text` | Accessibility: the `alt` of the full-size photo in every photo view |
| `colours`, `cloud_type`, `cloud_cover`, `drama` + `drama_reason`, `mood`, `vantage` | Scoring places, and search later on |

Choices worth knowing about:

- **Structured outputs, not forced tool use.** The request sets
  `output_config.format` to a JSON schema, so decoding is constrained to the
  schema (forced `tool_choice` returns a 400 on Claude Opus 5.5 anyway). The
  schema is generated from the Zod schema with the keywords structured
  outputs don't support (numeric ranges, lengths, patterns) removed, and
  the Zod schema then validates every response, so those limits are still
  enforced. The SDK's `zodOutputFormat` helper isn't used because it turns
  enums into descriptions, which would drop the constraint that matters
  most, the category.
- **Versioned prompts.** Each prompt is a file under `prompts/`, and every
  tag row records the version that produced it. Bumping
  `TAG_PROMPT_VERSION` makes every photo pending again, so the next run
  re-tags the archive under the new definitions.
- **Prompt caching.** The prompt and the list of known places come first in
  the system prompt and carry the cache breakpoint, and the photo comes after
  them. Every request in a run after the first reads that ~2,200-token prefix
  from the cache.
- **Files API.** Each photo is uploaded once and its `file_id` stored on
  `photos.claude_file_id`, so re-tagging (and, later, "show me past
  Stunning mornings at this spot") doesn't resend the bytes. Uploaded files
  stay in the Anthropic account until deleted.
- **Low effort.** Reading a sky is perception rather than long reasoning,
  so requests run at `effort: "low"`. Most output tokens are still thinking,
  so output dominates the cost (see below).
- **No refusal fallback.** Server-side `fallbacks` would re-run a refused
  request on another model, but the Batches API rejects the parameter, and
  a refused sunrise photo is unlikely. A refusal is logged and the photo stays
  pending.

### Running it

`npm run tag-photos` tags every photo that has no tags at the current prompt
version. By default it submits one Message Batch (half price, usually done
within the hour), stores the batch id in `tagging_batches`, and polls it.
Interrupting it is safe: the next run resumes the unfinished batch instead
of submitting a new one. `--sync` tags photo by photo instead, which is
quicker for a few photos; `--limit N` caps a run. With nothing left to tag,
a run makes no API calls.

Every run prints its token use: requests, how many hit the cache, and
uncached input, cache reads, cache writes and output. Each tag row also
keeps its own counts.

### Cost

Measured on the 113 sample photos (1600px JPEGs) with Claude Opus 5.5
($4 per million input tokens, $20 per million output) on 2026-10-29. Per
photo, on average:

| | Tokens | Cost |
| --- | --- | --- |
| Uncached input (mostly the image) | 1,388 | $0.0056 |
| Cache read (the shared prompt) | 1,931 | $0.0004 |
| Cache write (first requests of a run) | 279 | $0.0014 |
| Output (mostly thinking, at low effort) | 440 | $0.0088 |

That's about **$1.60 per 100 photos** through the Messages API and
**about $0.80 per 100** through Message Batches, which halves every line.
The 111-photo batch read 54% of its prompt tokens from the cache (97 of 111
requests hit it). Output is the biggest line, so `TAGGING_MODEL` is the
lever if the archive grows large: Claude Haiku 5.5 is roughly 40 times
cheaper per token. Compare its categories against Opus on a sample before
switching.

## The forecast record

`forecast_days` is a cache: one row per date, overwritten on every fetch,
so by morning the evening-before forecast is gone. `forecast_snapshots`
keeps it, one row per (date, lead time, source):

- **`live`** rows come from every forecast fetch. `lead_days` is the number
  of owner-local days between the fetch and the morning, so lead 1 is the
  forecast as it stood the day before. A later fetch on the same day
  replaces the row, so lead 1 ends up holding the last forecast issued that
  evening. The nightly cron (`/api/cron/forecast`, scheduled in
  `vercel.json`) makes sure that fetch happens even if the app isn't opened.
- **`historical`** rows are rebuilt by `npm run backfill-forecasts` from
  Open-Meteo's
  [Historical Forecast API](https://open-meteo.com/en/docs/historical-forecast-api),
  so calibration can start with the whole archive. These are lead 0: the
  archive is stitched from the first hours of each model run. The
  [Previous Runs API](https://open-meteo.com/en/docs/previous-runs-api) has
  true day-ahead values, but its archive lacks the low/mid/high cloud split
  and the visibility that the verdict rules need.

Snapshots store the forecast inputs as well as the verdict. Calibration
should re-derive the verdict from the inputs, as the planning view already
does, so a rule change applies to the whole history.

## The engine

The engine turns the forecast, the tagged photos and the walk log into a
plan for tomorrow. It splits the work in two: plain TypeScript does the
counting, and Claude does the judgement.

```
 forecast_snapshots ─┐
 photo_tags ─────────┼─▶ mornings.ts ─▶ calibration.ts ──┐
 walks + spots ──────┘   (one record     place-scores.ts ─┤
                          per morning)                    ▼
 memory_files ◀─▶ memory tool ◀──── Claude ◀── tools: get_forecast, forecast_accuracy,
                                      │               spots_for, similar_mornings
                                      ▼
                              recommendations (category, confidence, spot, reason, message)
```

### What plain code does

- **`mornings.ts`** joins everything known about each morning: the
  forecast (the evening-before live snapshot when there is one, else the
  historical one, with the verdict re-derived from its inputs), the sky the
  day's photo shows, and the walk log entry.
- **`calibration.ts`** counts, for each forecast category, how often the
  sky in the photo matched. Confidence is the Laplace-smoothed held-rate,
  `(held + 1) / (forecasts + 2)`, so a category with no history reads 0.5
  rather than 0 or 1. It also gives P(observed sky | forecast), which says
  how much to hedge.
- **`place-scores.ts`** scores each walk from 0 to 1 (the rating and the
  photos' drama, averaged) and averages them per spot and observed sky.
  Each average is shrunk towards a default for the spot's kind (high places
  for colour, forest for fog, a short walk for a clear sky, bed for rain),
  carrying one walk's worth of weight, so a new spot can still be suggested
  and one lucky morning can't dominate. A spot's rank for tomorrow is its
  expected score across the skies the forecast tends to bring.

`npm run calibration` prints all of this: the backtest (how often each
forecast held, and the full forecast-against-observed table), the place
scores, and the filed preferences. It makes no API calls.

### What Claude does

- **Planning** (`recommend.ts`, prompt in `prompts/recommend-walk/v1.md`):
  Claude reads the owner's preferences through the memory tool, then calls
  the four engine tools and decides, weighing stated preferences first,
  then the ranking, then specific past mornings. The answer comes back as
  structured output (category, confidence, spot, reason, up to two
  alternatives and the message the owner reads) and is validated: the spots
  must be real ones. Planning a past date uses only the mornings before it,
  and answers `get_forecast` from what was forecast at the time, so the
  recommender itself can be backtested.
- **Filing feedback** (`feedback.ts`, prompt in `prompts/file-feedback/v1.md`):
  Claude reads the existing preferences and edits them with the memory
  tool, adding, sharpening or replacing rules instead of appending.

Both run through `tool-loop.ts`, a manual tool-use loop written out on
purpose as a teaching example: ask, run every requested tool, return all
the results in one message, repeat. A failing tool goes back to Claude as
an error result rather than ending the run, and the loop stops after 12
turns. The custom tools use `strict: true`, so their inputs always match
their schemas. The memory tool (`memory_20250818`) is client-side: Claude
issues file commands and `memory-store.ts` carries them out against the
`memory_files` table, confined to `/memories`.

A plan takes 3 or 4 turns, since Claude batches its tool calls. With the
automatic cache breakpoint, each turn reads the earlier ones from the cache:
on the demo data, about 12,000 of 17,600 prompt tokens were cache reads,
and the whole plan cost about 6 cents with Claude Opus 5.5, half of it
the first turn's cache write.

## The walk buddy (Telegram)

The walk buddy is the engine's daily surface: a private chat with your own
Telegram bot, run from the Vercel app through the Bot API, so it works
without a laptop or a Claude Code session.

```
 Vercel cron (evening) ──▶ recommendWalk ──▶ sendMessage + a button per spot
                                                        │
 Telegram ──▶ POST /api/telegram ── secret header? owner's chat? new update_id?
                     │ (answers 200 at once; the work runs in after())
                     ▼
     button tap ──▶ logWalk ──▶ editMessageText (✓ spot, then 1–5 rating buttons)
     photo ──▶ getFile ──▶ sharp derivatives ──▶ Blob + Files API ──▶ tagPhoto
     photo or text ──▶ Claude: log_walk, add_spot, memory ──▶ reply
                     │
                     ▼
              telegram_updates (kind, error, tokens)
 Vercel cron (Sunday) ──▶ weekly "what I learned" (plain counting, no Claude call)
```

- **The evening plan** (`/api/cron/evening-plan`, 03:15 UTC) plans the
  next morning with the engine and sends its message with one button per
  suggested spot, plus "Stay in". A tap logs the walk (keeping any rating
  or note already there) and edits the plan in place to show it, with a row
  of 1–5 buttons to rate the morning. One message per morning, no replies.
- **A photo** is downloaded at its largest size, cut into the same two
  derivatives a Google Photos import stores (a 480 px square and up to
  1600 px wide), saved to Blob, uploaded to the Files API from the bytes in
  hand and tagged. It goes in the calendar on the morning it was sent:
  Telegram strips EXIF, so the message time stands in for when it was taken.
- **Words, with or without a photo,** go to Claude (`walk-buddy.ts`, prompt
  in `prompts/walk-buddy/v1.md`) with the morning's context: what's logged,
  last night's plan, the spots and the photo's tag. It has three tools:
  `log_walk` (a null field keeps what's logged), `add_spot` for a new place,
  and the memory tool for anything that should change future plans. Its
  reply says what it changed, so a mistake is easy to spot. A photo with no
  place takes the logged spot afterwards.
- **The weekly summary** (`/api/cron/weekly-summary`, Sundays) counts the
  last seven mornings: walks, ratings, the best morning, how often the
  week's forecasts held, the running held-rate per category, and which
  preference files changed. `/plan` and `/week` do the same on demand.

### Trust

The webhook rejects any request without the secret given to `setWebhook`
(Telegram echoes it in `X-Telegram-Bot-Api-Secret-Token`; compared in
constant time), then drops updates from any chat but `TELEGRAM_CHAT_ID`
with an empty 200. Past those checks the text is still not trusted: Claude
gets it fenced as the owner's account of a walk, the prompt says nothing in
it changes the rules, and the tools can only touch the one morning the code
chose. `log_walk` has no date parameter.

Telegram redelivers an update when the webhook is slow, so the route
records each `update_id` in `telegram_updates` before doing anything, and a
second copy is a no-op. The same row records the update's kind, any error
(also sent to the chat as "That didn't work: …") and the tokens it cost.

### Running it

1. Create a bot with @BotFather and set `TELEGRAM_BOT_TOKEN`.
2. Send it `/start` from your phone, then `npm run telegram -- chats` to
   find `TELEGRAM_CHAT_ID`.
3. Set `TELEGRAM_WEBHOOK_SECRET` (`openssl rand -hex 32`) and, with
   `SITE_URL` pointing at the deployment, `npm run telegram -- set-webhook`.
   `npm run telegram -- info` shows the webhook Telegram has on file and its
   last delivery error.

`npm run telegram -- plan` and `-- week` send the plan or the summary now.
`TELEGRAM_API_BASE` points the client somewhere else, which is how it was
tested: against a stand-in Bot API that logged every call. On demo data a
plan took 9 seconds; a photo with a caption (tag plus a 3-turn loop) read
7,100 prompt tokens from the cache, wrote 6,100 and sent 1,400 uncached;
a text message read 10,700 from the cache. Button taps make no Claude call.

## Not built yet

- Nothing tags photos imported from Google Photos as they arrive. Run
  `npm run tag-photos` after an import; photos sent to the walk buddy are
  tagged on arrival.
- There's no UI in the app to set or confirm a place, log a walk or add a
  spot; the walk buddy and `npm run walk` do it until the MCP server does.
- Logging a walk only sets the place of a photo sent with it. Photos
  imported from Google Photos are joined to the walk log by date.
