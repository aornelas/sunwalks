# Architecture: the Claude layer

The README covers the calendar itself. This page covers what sits on top of
it: the photo-source interface, vision tagging, and the forecast record
they're compared against. Together they're the foundations for the walk
recommender, the Telegram bot and the MCP server on the roadmap.

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
   nightly cron ──▶ forecast_snapshots (live) ──▶ calibration (roadmap)
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

## Not built yet

- Nothing tags new photos when they're imported. Run `npm run tag-photos`
  after an import; the Telegram bot will tag the photos it receives.
- There's no UI to set or confirm a place. The walk log (spot picker,
  Telegram buttons) is where places come from.
- Tagging reads its prompt from disk with `process.cwd()`. That's fine for
  scripts, but calling it from a Vercel function will need the `prompts/`
  folder added to `outputFileTracingIncludes`.
