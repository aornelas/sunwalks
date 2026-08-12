# Sunrise Calendar

A personal calendar where every day square is the sunrise photo captured that
morning, sourced from a Google Photos album. Built from the design handoff in
[`design_handoff_sunrise_calendar/`](design_handoff_sunrise_calendar/README.md).

## Stack

Next.js (App Router) · Drizzle ORM + Postgres · hand-rolled Google OAuth
(owner-only sign-in, `photoslibrary.readonly`) · Vercel Cron for daily ingest.

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

1. In Google Cloud Console: enable the **Photos Library API**, create an
   OAuth client (type "Web application"), and add
   `{SITE_URL}/api/auth/google/callback` as an authorized redirect URI.
2. Fill in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env`.
3. Set `OWNER_EMAIL` once you know it, so the (currently open) owner slot
   can't be claimed by a different Google account.
4. `npm run dev`, visit `/login`, sign in, pick an album on `/onboarding`.
5. For production, set `CRON_SECRET` and deploy — `vercel.json` wires up a
   daily cron hitting `/api/cron/sync`.

## Known gap: "place" captions

The design shows a location under the time (e.g. "6:24 AM · Telegraph
Hill"). The Google Photos Library API doesn't expose photo location data,
so `place` is left `undefined` throughout and the UI simply omits it from
the caption. Wiring this up for real would mean reading GPS EXIF yourself
(Photos API doesn't return it either) or reverse-geocoding coordinates from
another source — out of scope here.

## Project layout

- `src/lib/` — dates/calendar-grid math, Google OAuth + Photos API client,
  ingest, stats, crypto, session, DB queries.
- `src/db/` — Drizzle schema (`owner_account`, `photos`, `days`, `sync_log`,
  `share_links`, `sessions`).
- `src/app/api/` — auth, sync (owner + cron), albums/album, settings,
  day-photo, share-links, image proxy, and the `/api/s/[token]/*` read-only
  mirrors used by the share page.
- `src/components/calendar/` — `CalendarApp` (state/orchestration) plus the
  mobile shell, web shell, month/week/year zoom views, photo view (portrait,
  landscape, web), and the settings sheet.
- `src/components/onboarding/` — the first-run album picker.
- `scripts/seed.ts` — demo-mode seed data.

See the design handoff's own README for the full visual spec this
implementation follows.
