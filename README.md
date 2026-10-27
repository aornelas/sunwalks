# Sunwalks

A personal calendar where every day square is the sunrise photo you were out
for that morning. Photos come from Google Photos; days you didn't make it out
stay empty, so the calendar is the streak. At night, a planning view reads
tomorrow's forecast and tells you whether the walk is worth the alarm.

<p align="center">
  <img src="docs/screenshots/desktop-month.png" alt="Desktop month view with the stats rail" width="100%">
</p>

<p align="center">
  <img src="docs/screenshots/mobile-month.png" alt="Mobile month view" width="24%">
  <img src="docs/screenshots/mobile-photo.png" alt="Photo view, multi-shot morning" width="24%">
  <img src="docs/screenshots/mobile-planning.png" alt="Planning view for tomorrow's sunrise" width="24%">
  <img src="docs/screenshots/mobile-year.png" alt="Year view" width="24%">
</p>

> Screenshots use the bundled sample photos in [demo mode](#quickstart-demo-mode-no-google-account).

## Features

- **Week / Month / Year zoom** with animated transitions, a "sunwalk days
  only" filter that collapses empty days, and this/best stats for the week,
  month and year.
- **Photo view** with multi-shot mornings, a chosen "day photo",
  swipe-down to dismiss, and a landscape mode that unlocks rotation only while a photo
  is open.
- **Planning view** for tomorrow morning: first light, sunrise and end of golden
  hour (solar maths via `suncalc`), cloud layers and conditions from
  [Open-Meteo](https://open-meteo.com/), and a one-word verdict (*Promising*,
  *Good*, *Bare*, *Socked in*, *Wet*) with a week-ahead strip.
- **Unlisted share link.** Anyone with the URL gets a read-only, `noindex`
  copy of the calendar. You can revoke it or generate a new one.
- **Installable PWA**, tuned for Android/Chrome: safe-area insets, the
  hardware back button closes overlays, 48dp touch targets, and `?d=today`
  deep links.
- **Single owner by design.** One Google account signs in; everyone else sees
  only what the share link exposes.

## How it was built: Claude Design → Claude Code

The application code in this repo was written with
[Claude Code](https://claude.com/claude-code), working from design specs
produced in Claude Design. The git history is the build log; it covers
five days in August 2026.

| Step | What happened | Where to look |
| --- | --- | --- |
| Design | A Claude Design prototype plus a written handoff: layout, tokens, states and suggested architecture | [`design_handoff_sunrise_calendar/README.md`](design_handoff_sunrise_calendar/README.md) |
| One-shot build | The whole app, implemented from the handoff in a single pass | commit *"One shot implementation"* |
| Platform pass | Android/Pixel plumbing spec, then implementation | [`ANDROID_UPDATE.md`](design_handoff_sunrise_calendar/ANDROID_UPDATE.md) |
| Motion | Nine named motions with exact timings and curves, then implementation | [`MOTION.md`](design_handoff_sunrise_calendar/MOTION.md) and the interactive `Sunrise Motion (standalone).html` |
| Planning | Forecast screen and verdict rules, then implementation | [`PLANNING.md`](design_handoff_sunrise_calendar/PLANNING.md) |
| Rebrand | New icon set and the rename to Sunwalks | [`design_handoff_sunwalks_icon/`](design_handoff_sunwalks_icon/ICON.md) |

The real-world problems show up in the history too:

- **The Google Photos Library API shutdown.** It was retired mid-project; see
  [below](#google-photos-access) for the redesign it forced.
- **A storage migration.** Photos moved from local disk to Vercel Blob.
- **A multi-commit hunt for a shared-element animation "ghost".** It included
  a temporary on-screen debug panel, which was later removed.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Drizzle ORM + Postgres
(Neon in production) · Vercel Blob (private store) for photo bytes ·
hand-rolled Google OAuth · Google Photos **Picker API** · Open-Meteo +
`suncalc` · CSS Modules, no UI framework.

## Quickstart (demo mode, no Google account)

Demo mode seeds about 130 days of captures from 12 bundled sample photos,
skips auth, and serves images from `public/seed-photos/`. With it you can
click through every screen without any credentials.

Requires Node 20.9+ and Postgres.

```bash
git clone https://github.com/aornelas/sunwalks.git && cd sunwalks
npm install
docker compose up -d          # or any local Postgres
cp .env.example .env          # defaults point at the compose database
```

Set `DEMO_MODE=true` in `.env`, then:

```bash
npm run db:push               # create the schema
npm run db:seed               # demo data (wipes the demo tables first)
npm run dev
```

Open http://localhost:3000.

> **Never set `DEMO_MODE=true` in production.** It disables the owner check
> on every route.
>
> **Env precedence gotcha.** `npm run db:seed` reads only `.env`, but
> `next dev` also loads `.env.local`, which wins. If you've run
> `vercel env pull`, `.env.local` may point the dev server at your production
> database. Keep demo settings in `.env` and delete or rename `.env.local`
> while demoing.

## Real setup (your own Google Photos)

### Google Photos access

The original design assumed the Photos **Library** API: point the app at an
album and sync it daily. Google
[removed that access](https://developers.google.com/photos/support/updates)
on 2025-03-31 (`photoslibrary.readonly`, `albums.list` and
`mediaItems.search` now return 403). The replacement **Picker API** is a
one-time, user-present selection flow, so:

- **No automatic sync.** Every import is you opening the picker ("Add
  photos"). It supports multi-select (up to 2000 items), so a first bulk
  import and later top-ups each take one pass. See
  `src/hooks/usePickerImport.ts` (create session → open picker → poll →
  import).
- **Photos are copied at import time.** A picked item's `baseUrl` expires
  after about an hour, so a square (480px) and a full (1600px) derivative are
  downloaded once and stored in a private Vercel Blob store
  (`src/lib/storage.ts`). After that they're served through
  `/api/photos/[id]/image`.

### Steps

1. **Google Cloud Console.**
   - Enable the **Google Photos Picker API**. Not the "Photos Library API";
     that's the retired one.
   - Create an OAuth client of type *Web application*.
   - Add `{SITE_URL}/api/auth/google/callback` as an authorized redirect URI.
   - On the consent screen, add the
     `https://www.googleapis.com/auth/photospicker.mediaitems.readonly`
     scope.
   - Use user type **External** and add yourself as a test user. Otherwise
     personal accounts get "Access blocked".
2. **Vercel Blob.** Create a Blob store and set `BLOB_READ_WRITE_TOKEN`.
3. **Fill in `.env`** (see below), keeping `DEMO_MODE=false`. Run
   `npm run db:push` and then `npm run dev`.
4. **Sign in and import.** Visit `/login`, sign in, then pick your sunrise
   photos on `/onboarding`.
5. **Lock the owner slot.** Set `OWNER_EMAIL` to your address so no other
   Google account can claim it.
6. **Mind the 7-day token expiry.** While the consent screen is in
   *Testing*, Google expires refresh tokens after 7 days, so you'll need to
   re-sign-in (Settings → Change). Publishing the app to *Production* ends
   that. A single-user app doesn't need Google's verification, though you'll
   see a one-time "unverified app" screen.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string |
| `APP_SECRET` | yes | Passphrase for the AES-256 key that encrypts the stored Google refresh token (`openssl rand -base64 32`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | real mode | OAuth client from the steps above |
| `BLOB_READ_WRITE_TOKEN` | real mode | Vercel Blob store for imported photos |
| `SITE_URL` | yes | Public origin; used for the OAuth redirect and share links |
| `OWNER_EMAIL` | recommended | Restricts sign-in to this Google account |
| `APP_TIMEZONE` | no | IANA zone that defines a "day" (default `America/Los_Angeles`) |
| `OWNER_LAT` / `OWNER_LON` | no | Location for the planning forecast (defaults to San Francisco) |
| `DEMO_MODE` | no | `true` = seeded local preview, no auth |

### Deploying

The app runs on Vercel as-is:

1. Import the repo into Vercel.
2. Attach a Postgres database (e.g. Neon from the Vercel Marketplace) and a
   Blob store.
3. Set the variables above.
4. Run `npm run db:push` against the production `DATABASE_URL` once.

## Project layout

```
src/app/                 routes: calendar, /login, /onboarding, /s/[token] share page
src/app/api/             auth, picker sessions + import, days/stats, planning,
                         share links, image proxy, /api/s/[token]/* read-only mirrors
src/components/calendar/ CalendarApp (state) + mobile/web shells, zoom views,
                         photo views, planning view, settings sheet
src/lib/                 dates + grid maths, Google OAuth/Picker client, ingest,
                         Blob storage, stats, weather + verdict rules, crypto, session
src/db/                  Drizzle schema
scripts/seed.ts          demo-mode seed data
design_handoff_*/        the Claude Design specs this was built from
```

## Known gaps

- **No location captions.** The design shows a place under the time; the
  Picker API exposes no location data, so it's omitted.
- **No AVIF/WebP or Display P3.** Imported photos are the sRGB JPEGs Google
  serves; re-encoding on import isn't implemented.
- **No automatic sync.** This is a Google platform restriction (see above).
- **Built for one person in one place.** The verdict copy assumes coastal fog
  ("marine layer"), and the Android tuning targeted a Pixel 10 Pro XL.

## License

[MIT](LICENSE)
