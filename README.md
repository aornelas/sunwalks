# Sunrise Calendar

A personal calendar where every day square is the sunrise photo captured that
morning, sourced from Google Photos. Built from the design handoff in
[`design_handoff_sunrise_calendar/`](design_handoff_sunrise_calendar/README.md).

## Stack

Next.js (App Router) · Drizzle ORM + Postgres · hand-rolled Google OAuth
(owner-only sign-in) · the **Google Photos Picker API** for ingest (see
below — this replaced the original Library API design after Google
deprecated it) · local filesystem photo storage.

## Google Photos access — read this before setting up OAuth

The original design assumed the old Library API: point the app at an album,
poll it automatically every day, done. **Google removed that entirely**
(`photoslibrary.readonly`, `albums.list`, `mediaItems.search` all return 403
as of March 2025 — see
[Google's migration notes](https://developers.google.com/photos/support/updates)).
The replacement, the **Picker API**, is fundamentally different: it's a
one-time, user-present selection flow with no concept of "watch this album
for new items." There is no way to get unattended, automatic daily sync
against a real Google Photos library anymore — this is a platform
restriction, not a bug in this app.

What that means here:

- **No more automatic daily sync / cron.** `/api/cron/sync` and the
  `vercel.json` cron entry are gone. Every import is the owner explicitly
  opening a picker.
- **"Add photos" opens a real Google Photos tab.** The Picker API natively
  supports multi-select (up to 2000 items in one go), so a first-time
  bulk import and occasional top-ups both work in one pass — see
  `src/hooks/usePickerImport.ts` for the create-session → open tab → poll →
  import flow, used from onboarding, the settings sheet, and the web rail.
- **Photo bytes are downloaded once, at import time, into local storage**
  (`src/lib/storage.ts`), not proxied live from Google on each request. A
  picked item's `baseUrl` expires in ~60 minutes and can't be refreshed once
  the picker session is gone, so there's no "proxy on demand" option anymore
  — see the note atop `src/lib/ingest.ts`.
- **Local filesystem storage works for local dev, not for Vercel.**
  Vercel's serverless functions have an ephemeral, read-only filesystem —
  writes to `.photo-storage/` won't persist there. Before deploying to
  Vercel, swap `src/lib/storage.ts` for Vercel Blob (`@vercel/blob`) or
  S3/R2; the two-function interface (`saveImage`/`readImage`) is designed to
  be a drop-in swap.

## Local setup

1. **Postgres** — either:
   - `docker compose up -d`, or
   - a local Postgres (`brew install postgresql@16`), or
   - a hosted one (Neon / Vercel Postgres) for `DATABASE_URL`.
2. Copy `.env.example` to `.env` and fill in `DATABASE_URL` and `APP_SECRET`
   (`openssl rand -base64 32`). Leave `GOOGLE_CLIENT_ID`/`SECRET` blank for now
   if you just want to preview the UI (see **Demo mode** below).
3. `npm install`
4. `npm run db:push` — applies the schema (or `npm run db:generate` +
   your own migration runner in production).
5. `npm run dev`

### Demo mode (no Google account needed)

Set `DEMO_MODE=true` in `.env`, then `npm run db:seed`. This seeds ~130 days
of captures cycling the 12 sample photos from the design bundle, bypasses
auth entirely, and serves images from `public/seed-photos/` instead of
Google Photos — enough to click through every screen (month/week/year zoom,
filter, photo view, landscape rotation, settings sheet, share link) without
any external credentials. **Never set `DEMO_MODE=true` in production** — it
disables the owner auth check on every API route.

### Real Google Photos

1. In Google Cloud Console: enable the **Google Photos Picker API** (not
   "Photos Library API" — that's the deprecated one), create an OAuth
   client (type "Web application"), add
   `{SITE_URL}/api/auth/google/callback` as an authorized redirect URI, and
   on the **OAuth consent screen** add the
   `https://www.googleapis.com/auth/photospicker.mediaitems.readonly` scope
   under Data Access. If your project shows "Internal" user type and you're
   not signing in with a Workspace account in that org, switch it to
   **External** and add yourself under **Test users** — otherwise you'll
   hit "Access blocked: can only be used within its organization."
2. Fill in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env`.
3. Set `OWNER_EMAIL` once you know it, so the (currently open) owner slot
   can't be claimed by a different Google account.
4. `npm run dev`, visit `/login`, sign in, choose your sunrise photos on
   `/onboarding` (multi-select works — pick as many as you want in one go).
5. While the app is in "Testing" publish status, Google expires refresh
   tokens after 7 days — you'll need to re-sign-in (Settings → Change)
   periodically until you publish the consent screen to Production (doesn't
   require Google's verification process for a single-user personal app,
   though you may see a one-time "unverified app" click-through).

## Known gaps

- **"place" captions.** The design shows a location under the time (e.g.
  "6:24 AM · Telegraph Hill"). Neither the old Library API nor the Picker
  API expose photo location data, so `place` is left `undefined` throughout
  and the UI simply omits it from the caption.
- **AVIF/WebP and Display P3.** `design_handoff_sunrise_calendar/ANDROID_UPDATE.md`
  §9 asks for modern image formats and a wide-gamut export for the Pixel's
  panel. Imported photos are plain sRGB JPEGs downloaded as-is from Google's
  derivative endpoint (see `src/lib/image.ts`) — real format/gamut control
  would mean re-encoding on import, not implemented here.
- **No automatic sync**, as described above — this is a Google platform
  restriction as of March 2025, not something fixable in this app.

## Android platform update

`design_handoff_sunrise_calendar/ANDROID_UPDATE.md` is a platform-plumbing
pass for the Pixel 10 Pro XL / Chrome — safe-area insets instead of iOS
paddings, hardware-back closing overlays via real history entries (with
`?d=YYYY-MM-DD` / `?d=today` deep links), 48dp touch targets drawn at their
original visual size, swipe-down-to-dismiss on the photo view, orientation
unlock scoped to the photo view only, `rem`-based type for system font
scaling, and `content-visibility`/sticky-header/transform-only-animation
tweaks for 120Hz scrolling. No visual design changed. Notably, fixing this
surfaced a real bug: the desktop-layout breakpoint (`min-width: 900px`) was
misreading this phone's ~998px-wide landscape orientation as a desktop —
`useIsDesktop` now also requires `pointer: fine`.

## Project layout

- `src/lib/` — dates/calendar-grid math, Google OAuth + Picker API client,
  ingest (picker-session import), local photo storage, stats, crypto,
  session, DB queries.
- `src/db/` — Drizzle schema (`owner_account`, `photos`, `days`, `sync_log`,
  `share_links`, `sessions`).
- `src/app/api/picker/session/` — create a picker session, poll its status,
  and import once the owner's done picking (`src/hooks/usePickerImport.ts`
  drives these three from the client).
- `src/app/api/` (rest) — auth, day-photo, share-links, image proxy, and the
  `/api/s/[token]/*` read-only mirrors used by the share page.
- `src/components/calendar/` — `CalendarApp` (state/orchestration) plus the
  mobile shell, web shell, month/week/year zoom views, photo view (portrait,
  landscape, web), and the settings sheet.
- `src/components/onboarding/` — the first-run picker flow.
- `scripts/seed.ts` — demo-mode seed data.

See the design handoff's own README for the full visual spec this
implementation follows.
