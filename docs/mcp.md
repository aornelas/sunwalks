# Sunwalks in Claude (MCP)

An MCP server over the same engine the web app and the walk buddy use, so
Claude Desktop, Claude Code or any MCP client can plan a walk, log a
morning or search the archive. In hosts that render MCP Apps (Claude
Desktop, claude.ai), the plan arrives as the planning card.

```
Claude Desktop / Claude Code ──stdio──▶ scripts/mcp.ts ──▶ src/mcp/server.ts
                                                            │
                         recommend_walk ─▶ recommendations table (or recommendWalk on refresh)
                         log_walk       ─▶ logWalk, asking for what's missing
                         list_spots     ─▶ listSpots + reachFor + morningSchedule
                         forecast_accuracy ─▶ computeCalibration
                         find_photos    ─▶ photos + photo_tags
                                                            │
                                                    Postgres (DATABASE_URL)
```

Built on the MCP TypeScript SDK v2 (`@modelcontextprotocol/server`, spec
2026-07-28) and MCP Apps 2.0 (`@modelcontextprotocol/ext-apps`). The server
speaks both the 2026-07-28 revision and the 2025 ones; `serveStdio` picks
per connection.

## What it offers

| | Name | What it does |
|---|---|---|
| Tool | `recommend_walk` | The plan for the next sunrise: the sky the forecast points to, how far to trust it, and three spots that fit the morning, each with a past photo from there on a similar sky. Returns the plan the evening job stored; `refresh: true` plans again now (a Claude API call). Renders as the planning card. |
| Tool | `log_walk` | Logs or corrects a morning: place, 1–5 rating, note. Up to 14 days back. If the place is still unknown, it asks with a form (elicitation). |
| Tool | `list_spots` | Spots, their timings, and whether each fits a morning's schedule. |
| Tool | `forecast_accuracy` | How often each forecast category held, and what it turned out to be instead. |
| Tool | `find_photos` | Photos by date range, sky and place, each with a `sunwalks://photo/{id}` resource. |
| Resource | `sunwalks://spots` | Every spot and its timing, as JSON. |
| Resource | `sunwalks://spot/{name}` | One spot, with its logged mornings. |
| Resource | `sunwalks://photo/{id}` | One photo, as a JPEG up to 1600px wide. |
| Resource | `ui://sunwalks/planning-card.html` | The planning card (MCP App). |
| Prompt | `/plan-tomorrow` | Calls `recommend_walk` and says where to go in a sentence or two. |
| Prompt | `/how-was-it` | Logs this morning with `log_walk`, asking where you were if it doesn't know. |

All tools carry input and output schemas; results come back both as text
for the model and as `structuredContent` for the card.

## The plan is advice

Nothing here records a choice the night before. The card has no buttons:
it shows the best bet and two alternatives, and you decide in the morning
and report where you went (with the walk buddy, `log_walk`, or
`npm run walk`). `/how-was-it` never pre-fills the place from last night's
plan.

## The planning card

`src/mcp/card/view.ts` is the card's script: it connects with the MCP Apps
`App` class, takes `recommend_walk`'s `structuredContent`, and draws the
category, a confidence bar, the plan's message and three spot tiles.
`src/mcp/card-html.ts` bundles it with esbuild (once per server process)
and inlines it, with the styles, into one HTML document, so there's no
build step to remember.

- **Photos are inlined.** Each tile's photo is the 480px square as a JPEG
  data URL (about 40 KB). The card runs in the host's sandbox, which can't
  reach the private Blob store or the app's session cookie.
- **Which photo:** the most dramatic tagged photo from that spot on a
  morning whose sky matched tonight's forecast, else the most dramatic one
  from there. A photo is from a spot when its own place says so or, for
  photos imported from Google Photos (which have no place), when that
  morning's walk was logged there. Untagged photos (imports wait for
  `npm run tag-photos`) count too, after the tagged ones.
- **Colours** match the planning view: the dark photo ground and each
  category's tone from `toneFor()`.

## Asking for a missing report (elicitation)

When `log_walk` doesn't know where you were, it doesn't guess. On a
2026-07-28 connection it returns an `input_required` result with a form
(your spots, Home, Slept in, and an optional 1–5 rating); the client shows
the form and retries the call with your answer. On older connections the
SDK's legacy shim turns the same return into an `elicitation/create`
request mid-call. One handler covers both. Clients without form elicitation
get a tool error, and the model can ask in words instead.

## Running it

Point it at a database with `DATABASE_URL` (`.env.local`, then `.env`,
are read quietly, with `.env.local` winning as it does for the app;
stdout carries the protocol, so the server never prints to it).
Set `DEMO_MODE=true` for the demo database, so photos come from
`public/seed-photos/`.

**Claude Code** (from this folder):

```bash
claude mcp add sunwalks -- npm run --silent --prefix /path/to/sunwalks mcp
```

**Claude Desktop**: Settings → Developer → Edit Config, then add:

```json
{
  "mcpServers": {
    "sunwalks": {
      "command": "npm",
      "args": ["run", "--silent", "--prefix", "/path/to/sunwalks", "mcp"]
    }
  }
}
```

Restart Claude Desktop. The first time `recommend_walk` runs, it asks
permission to display the card.

**MCP Inspector:**

```bash
npx @modelcontextprotocol/inspector --cli --method tools/list npm run --silent mcp
```

Add `--protocol-era modern` to test the 2026-07-28 revision, and
`-e DATABASE_URL=… -e DEMO_MODE=true` for the demo database.

## Tests

`test/mcp.test.mts` connects a client over an in-memory transport and
checks the tools, prompts and resource templates, and that the card's page
is one document with nothing that commits to a spot. During development the
server was also driven over stdio against the demo database: every tool,
resource and prompt, elicitation on both protocol eras, and the card
rendered through `AppBridge` at desktop and phone widths.

## Not built yet

- **claude.ai and the phone.** They need a remote server (Streamable HTTP)
  with OAuth; this one is stdio only, for Claude Desktop and Claude Code.
- Claude Code shows the tools' text, not the card.
- No resource subscriptions: a client reading `sunwalks://spots` isn't told
  when a spot changes.
