# Handoff: Sunrise Calendar

A personal web app that renders a calendar where every day square is the sunrise photo captured that morning. Photos come from an existing Google Photos album; days without a photo stay empty. The point is the at-a-glance streak: how consistently the owner has been out at sunrise. Viewable on phone and desktop, and shareable with family via an unlisted, unauthenticated URL.

## About the design files

The files in this bundle are **design references authored in HTML** — a working prototype of look and behavior, not production code to lift. Recreate them in the target codebase's environment using its established patterns and libraries. There is no codebase yet (the repo `aornelas/sunrise-calendar` is empty), so pick the stack; the recommendation in *Suggested architecture* below is a starting point, not a constraint.

`Sunrise Calendar.dc.html` is a single-file prototype containing three views side by side on one canvas (badges `1a`, `1b`, `1c`). It uses a small template runtime plus two device-frame helpers (`ios-frame.jsx`, `browser-window.jsx`) purely to draw the phone bezel and browser chrome — **none of that is part of the product**. Ignore the frames; implement what is inside them.

**Looking ahead is specified separately.** `PLANNING.md` in this bundle covers the night-time planning view (badge `3c`) — the forecast screen, its entry point on the calendar, and the verdict rules. This README covers the calendar itself.

## Fidelity

**High-fidelity.** Colors, type, spacing, radii, states and copy are final. Recreate pixel-for-pixel. All values come from the Organic design system (`styles.css` in this bundle) — consume those CSS variables rather than re-typing hex codes.

---

## Screens / views

### 1a — Mobile app (primary)

Viewport 402×874 (iPhone). Single scrolling column, page padding `14px` sides, `54px` top (clears the status bar), `96px` bottom (clears the floating control bar). Ground `--color-bg` #f5ead8.

**Header row** — `display:flex; align-items:flex-start; justify-content:space-between; gap:10px; padding:2px 0 4px`
- Wordmark "Sunrise": `<h3>`, `--font-heading` (Caprasimo) 26px, `letter-spacing:-.02em`, color `--color-text`.
- Under it, today's date, e.g. "Tuesday, August 11": Figtree 11px/600, `--color-neutral-700`, `margin-top:2px`, `white-space:nowrap`. Today's date is deliberately more prominent than sync status; last-sync time lives in the settings sheet only.
- Right: two 34×34 circular icon buttons, `border-radius:999px`, fill `--color-neutral-200`, `gap:6px`, icons 16–17px Lucide, stroke `#645c50`.
  - **Refresh** (`refresh-cw`, stroke-width 2.75) — fetch on demand.
  - **Gear** (`settings`, stroke-width 1.9 for legibility at 17px) — opens the Source & sharing sheet.

**Last-7-days strip** — `display:flex; gap:6px; margin:14px 0 10px`. Seven equal columns, each: a circle (`aspect-ratio:1; border-radius:999px; overflow:hidden`, fallback fill `--color-neutral-200`) with the day's photo `object-fit:cover`; today gets `box-shadow: inset 0 0 0 2px var(--color-accent)`. Below each, the weekday initial: Figtree 9.5px/600, `letter-spacing:.06em`, uppercase, `--color-neutral-600`, `gap:5px`. Tapping a circle with a photo opens the photo view.

**Stats line** — one row, not a card: `display:flex; flex-wrap:wrap; align-items:center; gap:4px 11px; white-space:nowrap; padding:13px 0`, hairline `1px solid var(--color-divider)` top and bottom, `margin-bottom:18px`, Figtree 11.5px, `--color-neutral-700`. Four stats, each a `<span>` with the number in `<b>` 700 `--color-accent-700`:
- `99 sunrises` — lifetime total
- `6 this week` — captures in the last 7 days
- `20 this month` — captures in the last 30 days
- `4.4 a week` — average captures per week since the first photo

**Month grid** (default zoom) — weekday header row `S M T W T F S`: 7-col grid, `gap:4px`, centered, Figtree 9px/600, `letter-spacing:.1em`, `--color-neutral-500`, `margin-bottom:7px`. Then one block per month, newest first (August, July, June, …), `margin-bottom:26px`:
- Month title: Caprasimo 18px + a count "9 CAPTURED" in Figtree 9px/600, `letter-spacing:.12em`, uppercase, `--color-neutral-600`, `gap:8px`, `margin:0 0 9px 2px`.
- Grid: `grid-template-columns:repeat(7,1fr); gap:4px`; cells `aspect-ratio:1; border-radius:12px`.
  - **Captured day**: photo `object-fit:cover`, `box-shadow:var(--shadow-sm)`; date number top-left (`top:2px; left:5px`) Figtree 9px/700 `#fff` at `opacity:.92` with `text-shadow:0 1px 3px rgba(0,0,0,.55)`; if more than one shot that day, a 4px white dot bottom-right (`bottom:4px; right:4px`, `box-shadow:0 0 0 2px rgba(255,255,255,.35)`). Today adds `inset 0 0 0 2px var(--color-accent)`.
  - **Missed day**: flat `--color-neutral-300` square, date number `--color-neutral-500`. No photo, no border, nothing else — the grey gap is the signal.
  - **Leading blanks and future days of the current month**: empty cells (nothing rendered).

**Week zoom** — three most recent weeks, newest first. Per week: label "Aug 9 – 15" Figtree 10px/600, `letter-spacing:.12em`, uppercase, `--color-neutral-600`. Cells in a 4-col grid, `gap:6px`, `aspect-ratio:1`, `border-radius:16px`:
- Captured: photo with a bottom scrim `linear-gradient(to top, rgba(0,0,0,.5), transparent)`, `padding:16px 8px 6px`; "Tue 11" Figtree 11px/700 `#fff`, time "6:24 AM" 9.5px `rgba(255,255,255,.8)`.
- Missed: `--color-neutral-300` fill, "Sat 8" `--color-neutral-500`, "no walk" 9.5px `--color-neutral-400`.
- Future: no fill at all — weekday + number only in `--color-neutral-400`.
- Today: accent inset ring, whichever state.

**Year zoom** — 3-col layout of 12 mini months, `gap:16px 12px`. Per month: "Aug" Caprasimo 13px, count right-aligned Figtree 9px/600 `--color-neutral-600` (em dash when zero), then a 7-col grid of `gap:2px`, `aspect-ratio:1`, `border-radius:2px` squares — captured = the photo itself, missed = `--color-neutral-300`, future = nothing. Today gets `inset 0 0 0 1.5px var(--color-accent)`. Tapping a month jumps to that month in the month zoom.

**Floating control bar** — `position:absolute; left:14px; right:14px; bottom:14px; padding:6px; border-radius:999px; background:rgba(245,234,216,.86); backdrop-filter:blur(14px); box-shadow:var(--shadow-md)`. Three equal pills — Week / Month / Year, Caprasimo 13px, `padding:8px 0`, `border-radius:999px`; selected = `--color-accent` fill with `--color-bg` text, unselected = transparent with `--color-neutral-700`. Then a 36×36 round toggle for **sunrise days only**: off = `--color-neutral-200` fill with `#645c50` sunrise icon (Lucide `sunrise`, stroke 2.75), on = `--color-accent-2-600` fill with white icon.
- The filter applies to **all three zooms**: month grids drop empty days and leading blanks so the photos close up into a dense grid; week rows keep only captured days; year mini-grids keep only captured squares.

**Photo view** (full-screen overlay, `background:#17140f`)
- Top bar `padding:52px 16px 10px`, `justify-content:space-between`: close (X) and share buttons, 34×34, `background:rgba(255,255,255,.12)`; center block `flex:1; min-width:0; text-align:center` with the long date ("Tuesday, August 11") Caprasimo 15px `#f5ead8`, one line with ellipsis, and under it "6:24 AM · Telegraph Hill" Figtree 10.5px `rgba(245,234,216,.55)`.
- Photo area `flex:1`, image `object-fit:contain`, full width. Left/right 32px round chevrons (`rgba(23,20,15,.45)`) step to the previous/next **captured** day — skipping empty days entirely.
- Bottom block `padding:12px 16px 26px`: caption "6:24 AM · Telegraph Hill · shot 2 of 3" Figtree 11.5px `rgba(245,234,216,.7)`.
- Multi-shot days only: a row with "3 SHOTS THIS MORNING" (Figtree 9px/600, `letter-spacing:.14em`, uppercase, `rgba(245,234,216,.45)`) and, on the right, either a `--color-accent` pill "Set as day photo" (Caprasimo 11.5px, `--color-bg` text) when the shot on screen is not the day photo, or an inert `rgba(255,255,255,.1)` pill reading "Day photo" when it is. Below, 62×62 thumbnails, `gap:8px`, `border-radius:12px`: the one being viewed has a `#f5ead8` 2.5px inset ring, the others are dimmed `rgba(23,20,15,.4)`, and the current day photo carries an 8px `--color-accent` dot top-right. **Tapping a thumbnail only changes what you're viewing; the pill commits it.** Committing updates the calendar square, the strip circle and the year dot.

**Source & sharing sheet** — bottom sheet over `rgba(23,20,15,.4)`: `border-radius:28px 28px 0 0`, `--color-bg`, `padding:20px 20px 26px`, `box-shadow:var(--shadow-lg)`. Title "Source & sharing" Caprasimo 20px with a "Done" link (Figtree 12px/600 `--color-accent-700`). Two `--color-neutral-100` cards, `border-radius:20px`, `padding:14px 16px`, rows split by `1px var(--color-divider)`:
1. **Google Photos** — a `--color-accent-2-600` 8px status dot + account email, with a "Change" affordance; **Album — "Sunrises"** with "112 photos · read-only" and "Switch"; **Fetch once a day** with the last-sync line ("Synced 6:52 AM") and a 44×26 pill toggle (on = `--color-accent-2-600`, off = `--color-neutral-400`, 20px white knob).
2. **Share link** — description "Anyone with the link can look. Not indexed, no sign-in."; the URL in a `--color-neutral-200` pill, monospace 11.5px, truncating; a `--color-accent` "Copy link" pill that flips to "Link copied" for 1.8s.
Below both, a full-width secondary pill "Fetch new photos now" (`1px solid var(--color-divider)`, Caprasimo 14px).

### 2a — Landscape photo view (mobile, rotated)

**Orientation rule: the calendar is portrait-locked; only the photo view rotates.** On a 402×874 screen a 16:9 sunrise can only fill about a third of the frame, so rotating is the way to see the photo properly. Rotating anywhere else in the app does nothing.

Canvas 874×402 (the same device rotated). The photo is the entire screen; all chrome floats on top.
- **Image**: `object-fit:cover` filling the frame by default (a ~2.17:1 window crops a 16:9 photo top and bottom by roughly 18%). A fill/fit button in the top-right switches to `object-fit:contain` — whole frame, letterboxed on the sides. Lucide `maximize`/`minimize`, 17px.
- **Tap the photo** toggles all chrome off/on. Chrome starts visible; hiding it leaves nothing but the sunrise.
- **Scrims** (only while chrome is visible): top `linear-gradient(to bottom, rgba(23,20,15,.55), transparent)` 96px tall; bottom `linear-gradient(to top, rgba(23,20,15,.7), transparent)` 140px tall. Chrome buttons are 36×36 pills, `rgba(23,20,15,.45)` with `backdrop-filter:blur(8px)`.
- **Top row** `left/right:22px; top:16px`: close (X) at left; fill/fit and share at right, `gap:8px`.
- **Chevrons**: vertically centered, `rgba(23,20,15,.35)`; previous sits at `left:52px` to clear the dynamic island, next at `right:22px`. They step between captured days, same as portrait.
- **Bottom row** `left/right:26px; bottom:22px`, `align-items:flex-end; justify-content:space-between`: on the left the date in Caprasimo 19px `#f5ead8` with "6:33 AM · Crissy Field · shot 1 of 3" beneath in Figtree 11.5px `rgba(245,234,216,.72)`, one line. On the right, multi-shot days only: the "Set as day photo" / "Day photo" pill (Caprasimo 12px) followed by 56×44 thumbnails, `border-radius:10px`, `gap:7px` — same viewing ring / dim / accent day-photo dot as portrait.
- Rotating back returns to the portrait photo view on the same day and the same shot.
- Implementation notes: lock the app to portrait except this route (`screen.orientation.lock('portrait')` where available, or CSS-driven layout keyed to `orientation: landscape` scoped to the photo route). Transition the rotation as a plain re-layout — no custom rotate animation. Keep the safe-area insets: the island side needs the extra 30px of padding the chevron offset reflects.

### 1b — Web (same data, desktop layout)

1180×768 content area. Two columns: fluid main + fixed 266px right rail separated by `1px solid var(--color-divider)`. Main padding `30px 34px 34px`, rail `30px 26px`.
- **Header**: "Sunrise" Caprasimo 34px; today's date Figtree 12.5px/600 `--color-neutral-700`; then "Every morning I got up for, since March." 12px `--color-neutral-600`. Right side: Week / Month / Year pills (Caprasimo 13px, `padding:7px 15px`) plus a "Sunrise days only" pill offset by `margin-left:6px` — same selected/unselected treatment as mobile.
- **Month zoom**: two months side by side, `grid-template-columns:1fr 1fr; gap:30px`, newest left. Month title Caprasimo 21px + count. Cell grid `gap:5px`, `border-radius:14px`, date numbers 10.5px at `top:4px; left:7px`; multi-shot dot 5px. Same three day states, same today ring.
- **Week zoom**: the current week as 7 tall cards, `grid-template-columns:repeat(7,1fr); gap:8px; aspect-ratio:.78; border-radius:18px`, `--shadow-md`, scrim label "Tue 11" 13px/700 + time 11px.
- **Year zoom**: 6-col layout of 12 mini months, `gap:22px 18px`, month name Caprasimo 14px, dot grid `gap:3px; border-radius:3px`.
- **Right rail**: kicker "THIS YEAR SO FAR" (Figtree 9.5px/600, `letter-spacing:.14em`, uppercase, `--color-neutral-600`); the lifetime total as Caprasimo 40px `--color-accent-700` with the label "sunrises captured"; then a 2×2 grid of Caprasimo 22px figures — last 7 days, last 30 days, "a week, on average", "days in a row now". Divider, then "LAST 7 MORNINGS" as a 4-col grid of 10px-radius thumbnails with the date number bottom-left. Divider, then the sync line "Synced 6:52 AM from Google Photos, album 'Sunrises'." with "Fetch now" (secondary) and "Copy link" (accent) pills and the share URL beneath in 10.5px `--color-neutral-600`.
- **Photo view**: same overlay, `rgba(23,20,15,.93)`, `padding:22px 26px 24px`, date Caprasimo 22px top-left with caption beneath, close top-right, image `object-fit:contain` with `border-radius:14px`, chevrons at the edges, 76×60 thumbnails with the same view/commit split.

### 1c — First run

Phone, `padding:56px 22px 26px`. A 3×2 grid of 18px-radius squares — three filled with sunrise photos, three `--color-neutral-300` — as the wordless explanation of the product. Then the headline "One square for every morning you were out there." Caprasimo 30px, `line-height:1.08`, `letter-spacing:-.02em`, `text-wrap:pretty`; body copy Figtree 13.5px/1.55 `--color-neutral-700`: "Point this at the album you already keep. It picks up new photos once a day, reads the date off each one, and fills in the square. Nothing to log."
Then kicker "YOUR ALBUMS" and three rows (`--color-neutral-100`, `border-radius:20px`, `padding:11px 14px`, `gap:7px`), each a 42px cover thumbnail + name (13.5px/600) + subtitle (11px `--color-neutral-600`). The selected row carries `inset 0 0 0 2px var(--color-accent)` and a Lucide `check` in `--color-accent`. Bottom: full-width `--color-accent` pill "Use this album" (Caprasimo 16px, `padding:14px 0`) and, under it, "Read-only access. Photos stay in your account." centered, 11px `--color-neutral-600`.

---

## Interactions & behavior

| Trigger | Result |
| --- | --- |
| Tap a captured day (grid, strip, week card, year square) | Open the photo view for that day |
| Chevrons in the photo view | Move to the previous/next **captured** day, crossing month boundaries; no-op past the ends |
| Tap a thumbnail | Change the shot being viewed only — never the day photo |
| "Set as day photo" | Commit the viewed shot; calendar square, strip circle and year dot all update |
| Week / Month / Year | Switch zoom; state is per-surface |
| Sunrise-days-only toggle | Collapse empty days out of whichever zoom is showing |
| Tap a month in year zoom | Jump to that month in month zoom |
| Refresh icon / "Fetch new photos now" | Trigger an on-demand album sync; the sync line updates |
| Copy link | Copy the share URL, flip the label to "Link copied" for ~1.8s |
| Gear | Open the Source & sharing sheet |

Motion should stay quiet and unhurried — no bounce, no confetti. **`MOTION.md` supersedes this paragraph and is the authority on all timing**; the durations there are deliberately about twice a conventional UI's, because the app is used slowly at dawn. Scrolling is native and continuous through months — infinite scroll backwards through history, loading a month at a time.

Copy tone: quiet, personal, no gamification. Never "streak!", never a badge or a trophy. "days in a row now" is as far as it goes.

Empty and edge states to design/implement beyond the prototype:
- No album connected → the 1c screen.
- Album connected, zero photos → the month grid with all squares grey and one line of encouragement.
- Sync failure → the sync line reads the failure and offers retry; never block the calendar.
- A photo whose EXIF date is missing → fall back to the Google Photos creation time; if the capture time is after ~10am, still count it (the owner decides what a sunrise is), but flag nothing.

## State

Client state in the prototype (all of it belongs in the real app too):
- `view` / `dView`: `'week' | 'month' | 'year'` per surface
- `filter` / `dFilter`: boolean, sunrise days only
- `detail`: `{ month, day, view }` — which day is open and which shot is on screen (`view` defaults to the day photo)
- `chosen`: map of `date → shot index` — the day photo per multi-shot day (this one is server-persisted, not local)
- `sheet`, `copied`, `auto` (daily-fetch toggle), `synced` (last sync timestamp)

Server data the UI needs:
- `days: [{ date, shots: [{ id, url, thumbUrl, takenAt, place? }], dayShotId }]`
- `stats: { total, last7, last30, avgPerWeek, currentRun }` — computed server-side so mobile and web agree
- `sync: { lastSyncedAt, status, albumId, albumName, photoCount }`

## Suggested architecture (the part the design doesn't cover)

Not prescriptive — but this is the shape the design assumes.

- **Framework**: Next.js (App Router) on Vercel, or SvelteKit. Server-rendered calendar HTML so the shared link is fast and works without JS; client hydration for zoom, filter and the photo overlay.
- **Auth**: only the owner signs in — Google OAuth with the `photoslibrary.readonly` scope. Store the refresh token encrypted. Viewers of the share link never authenticate.
- **Google Photos ingest**: `mediaItems:search` scoped to the chosen album, paginated, on a daily cron (`vercel.json` cron or a scheduled job) plus an on-demand endpoint behind the refresh button. Persist per photo: media item id, `creationTime`, filename, width/height, base URL fetched fresh at render (Google's `baseUrl` expires ~60 min — never store it as a permanent image src). Group by local capture date in the owner's timezone; first shot of a day is the day photo until overridden.
- **Images**: do not hotlink Google's `baseUrl` from the client on every render. Either proxy through your own route that refreshes the base URL and caches, or copy derivatives into your own storage (R2/S3) on ingest and serve two sizes: ~400px square for grid squares and year dots, ~1200px long-edge for the photo view. Squares are center-cropped; the photo view shows the whole frame.
- **Data**: Postgres (or SQLite/Turso) — `photos`, `days` (date, day_shot_id), `sync_log`, `share_links`. Stats as a cached view recomputed on ingest.
- **Share links**: unguessable token in the path (e.g. `/s/x7q2k9`), row-level revocable, `X-Robots-Tag: noindex, nofollow` plus `robots.txt` disallow on `/s/*`, no owner email or account info anywhere in the shared render. Share view is identical to the owner's view, read-only: no gear, no refresh, no "set as day photo".
- **PWA**: manifest + icons so it installs to the home screen; cache the current month's squares for offline glancing.

## Design tokens

All from the Organic design system — `styles.css` is in this bundle; link it or port the `:root` block.

- Ground `--color-bg` #f5ead8 · surface `--color-surface` #ebddc5 · text `--color-text` #201e1d · divider = text at 16%
- Accent (terracotta) `--color-accent` #c67139; ramp 100→900 #fff2eb #ffe1d0 #ffc6a5 #f6a06b #d67f48 #b2622d #8c491a #643312 #402310
- Accent 2 (sage) `--color-accent-2` #7a8a5e; ramp #f0fae1 #e1eecc #ccdbb2 #aebf92 #8fa073 #728157 #56633f #3d472b #272e1b
- Neutrals #f9f4ed #eee7db #dcd3c4 #c0b6a5 #a19786 #82796a #645c50 #474238 #2e2b25
- Type: `--font-heading` Caprasimo 400 (all titles, pills, numbers-as-display) · `--font-body` Figtree 400/600/700
- Spacing 4.4 / 8.8 / 13.2 / 17.6 / 26.4 / 35.2px · radii `sm` 8 / `md` 16 / `lg` 28 / pills 999px
- Shadows `--shadow-sm/md/lg` as defined in the sheet
- Photo-specific values not in the token set (deliberate, keep them): grid cell radius 12px mobile / 14px web, week card 16–18px, year dot 2–3px, photo-view ground #17140f, overlay scrim `rgba(23,20,15,.4)`
- Icons: Lucide, stroke-width 2.75 except the 17px gear at 1.9. Used: `refresh-cw`, `settings`, `sunrise`, `x`, `share`, `chevron-left`, `chevron-right`, `check`
- Note: the design system's `.washed` treatment is intentionally **not** applied to sunrise photos — they are the subject, not decoration

## Assets

- `assets/sq/1–12.png` — 360×360 center crops of the owner's real sunrise photos, used for grid squares, strip circles and year dots.
- `assets/full/1–12.png` — 900px-wide versions for the photo view.
- Both are derived from twelve photos the owner supplied. In production these are generated from the Google Photos album; the prototype cycles the same twelve across 99 captured days.
- Fonts: Caprasimo + Figtree from Google Fonts (imported at the top of `styles.css`).

## Screenshots

In `screenshots/`, captured at 2×:

| File | State |
| --- | --- |
| `1a-mobile-month.png` | Mobile, month zoom — the default view |
| `1a-mobile-week.png` | Mobile, week zoom — past / missed / future / today states all visible |
| `1a-mobile-year.png` | Mobile, year zoom |
| `1a-mobile-filtered.png` | Mobile, month zoom with "sunrise days only" on — empty days collapsed |
| `1a-mobile-photo-view.png` | Photo view, single-shot day |
| `1a-mobile-photo-multishot.png` | Photo view, 3-shot day — thumbnail strip, viewing ring, day-photo dot, "Day photo" pill |
| `1a-mobile-settings-sheet.png` | Source & sharing sheet |
| `2a-mobile-landscape-photo.png` | Landscape photo view, chrome visible |
| `1b-web-month.png` | Web, month zoom with the stats rail |
| `1c-first-run.png` | First run / album picker |
| `3c-night-promising.png` | Planning view, tomorrow — see `PLANNING.md` |
| `3c-night-socked-in.png` | Planning view re-targeted to Thursday |
| `3c-calendar-entry.png` | Calendar with the "Plan tomorrow" entry row |

## Files in this bundle

| File | What it is |
| --- | --- |
| `Sunrise Calendar.dc.html` | The prototype: 2a landscape photo view, 1a mobile, 1b web, 1c first run, all interactive |
| `PLANNING.md` | Spec for the night-time planning view (`3c`) — forecast, timeline, verdicts |
| `MOTION.md` | The authority on all timing |
| `ANDROID_UPDATE.md` | Android-specific notes |
| `styles.css` | The Organic design system — tokens and component classes |
| `ios-frame.jsx`, `browser-window.jsx` | Device/browser chrome for the prototype only — not product code |
| `assets/sq/`, `assets/full/` | Sunrise photo derivatives |

To view the prototype, open `Sunrise Calendar.dc.html` in a browser (it needs `support.js` from the design environment; failing that, use it as a reference alongside this README, which is self-sufficient).
