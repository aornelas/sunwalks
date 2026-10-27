# Contributing

Thanks for your interest. Sunwalks is a personal project, so the scope is
deliberately narrow, but issues and small pull requests are welcome.

## Getting set up

Follow the [demo-mode quickstart](README.md#quickstart-demo-mode-no-google-account).
It needs only Node 20.9+ and Postgres; no Google or Vercel account.

## Before opening a pull request

- `npm run lint` and `npx tsc --noEmit` pass.
- You've clicked through the screens you touched in demo mode, on a phone-sized
  viewport and a desktop one.
- **No personal data.** Never commit real photos, location data, `.env*`
  files (other than `.env.example`), or account details. New images must pass
  `npm run sample-photos -- --check`.
- Keep pull requests focused, and explain the *why* in the description.

## Conventions

- File and directory names are hyphenated (`photo-source.ts`, not `photo_source.ts`).
- Match the existing stack: Next.js App Router, TypeScript, Drizzle and CSS
  Modules. Discuss new dependencies in an issue first.
- Visual and motion changes should follow the specs in
  `design_handoff_sunrise_calendar/`.

## Security

Please don't open public issues for security problems. Use GitHub's
[private vulnerability reporting](https://github.com/aornelas/sunwalks/security/advisories/new)
instead.
