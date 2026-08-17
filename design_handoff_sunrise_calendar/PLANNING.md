# Handoff: the Planning view (badge `3c`)

An addition to the Sunwalks app. Everything in `README.md` describes **looking back** — the calendar of mornings already walked. This document describes the one screen for **looking ahead**: a dark, night-legible view the owner opens before bed to decide whether tomorrow's sunrise is worth the alarm.

Read this alongside `README.md` (product context, tokens, architecture) and `MOTION.md` (all timing, which supersedes any duration named here).

## Fidelity

**High-fidelity.** Colors, type, spacing, radii, copy and the forecast→verdict mapping are final. The prototype is option `3c` inside `Sunrise Calendar.dc.html`; the phone bezel around it is not product.

## Scope — what this screen deliberately does not do

Three things were designed, reviewed and **cut**. Do not add them back:

- **No alarms.** The app never sets, suggests or displays an alarm.
- **No leave-by time.** No "leave at 5:48" anywhere, including the timeline.
- **No location or vantage-point recommendation.** No map, no "go to Telegraph Hill", no sun azimuth.

The owner handles wake-up, travel time and where to stand with other tools that have far more context. This screen answers exactly one question — *is tomorrow morning going to be any good, and when is it?* — and the only clock it owns is the sky's: first light, sunrise, golden ends.

---

## Where it sits

One route, one screen. It is not a tab and not a modal — it is a peer of the calendar, and only one of the two is on screen at a time.

**In:** a dark entry row pinned under the calendar header.
**Out:** a labelled "Calendar" pill at the top-left of the planning view.

An earlier draft used a bare down-chevron to leave, which read as "dismiss" rather than "go back to the calendar" — hence the label. Both controls say where they go in words.

### Entry row (on the calendar screen)

Sits between the header and the last-7-days strip: `margin:16px 0 18px`.

- Container: `display:flex; align-items:center; gap:12px; border-radius:20px; background:#17140f; padding:13px 15px; cursor:pointer`. A near-black row on the cream ground is the signal that it opens the night view — it is the only dark surface on the calendar screen.
- Icon: Lucide `moon`, 19px, stroke-width **2.4**, stroke `#e0954f`, `flex:none`.
- Kicker "PLAN TOMORROW": Figtree 9px/600, `letter-spacing:.14em`, uppercase, `rgba(245,234,216,.5)`.
- Below it, `gap:8px`, baseline-aligned: the verdict word in Caprasimo 16px tinted by the tone colour (see *Verdicts*), then "sunrise 6:24 AM" in Figtree 12px `rgba(245,234,216,.7)`, `white-space:nowrap`.
- Right: Lucide `chevron-right`, 16px, stroke 2.75, `rgba(245,234,216,.6)`.

The row is a live preview: it always shows tomorrow's verdict and sunrise time, so the calendar alone answers the question most nights and opening the view is optional.

---

## The planning view

Viewport 402×874. Ground `#17140f` (the same near-black as the photo view — the app already has exactly one dark surface colour; reuse it). Single scrolling column, `padding:52px 20px 26px`. Every value below is final.

### Header row

`display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:22px`

- **Left — back control**: `display:flex; align-items:center; gap:7px; border-radius:999px; background:rgba(255,255,255,.12); padding:7px 14px 7px 11px`. Lucide `chevron-left` 15px stroke 2.75 `#f5ead8`, then "Calendar" in Caprasimo 13px `#f5ead8`.
- **Right — context kicker**: "PLANNING TOMORROW" in Figtree 9.5px/600, `letter-spacing:.16em`, uppercase, `rgba(245,234,216,.5)`, `white-space:nowrap`. When a later day is selected from the week-ahead row it reads "PLANNING THU" (weekday short form).

### Verdict block

- Date kicker: the full date, e.g. "THURSDAY, AUGUST 13" — Figtree 10px/600, `letter-spacing:.14em`, uppercase, `rgba(245,234,216,.45)`, `margin-bottom:6px`.
- **Verdict**: one word, `<h3>`, Caprasimo **42px**, `line-height:1.02`, `letter-spacing:-.02em`, colour = the tone's `dark` value. This is the top line of the screen and the whole point of it — readable at arm's length in a dark room.
- **Reason line**: Figtree 14px/1.55 `rgba(245,234,216,.78)`, `text-wrap:pretty`, `margin:10px 0 24px`, **`min-height:44px`**. The min-height reserves two lines at this size so that stepping through days in the week-ahead row never shifts the timeline or anything below it. Keep the copy to two lines or fewer; if a future string needs three, raise the reservation rather than letting it reflow.

### Light-window timeline

A fixed two-hour window, **5:30 → 7:30 AM**, drawn once and never rescaled — the point is that the marks *move* a little between days rather than the bar re-fitting itself.

- Bar: `height:58px; border-radius:16px; margin-bottom:9px`, fill
  `linear-gradient(90deg,#1b1a28 0%,#2e2334 18%,#6b3a30 40%,#c67139 54%,#e2b46f 70%,#d9d3bd 100%)` — night, twilight, the terracotta accent at sunrise, then morning.
- Ticks: for each mark, `position:absolute; top:0; bottom:0; width:2px; background:rgba(23,20,15,.5)` at `left: (minutes − 330) / 120 × 100%`.
- Labels: a `height:44px` row beneath, each label `position:absolute; left:<same %>; transform:translateX(-50%); text-align:center; white-space:nowrap` — time in Caprasimo 13px `#f5ead8`, label under it in Figtree 8.5px/600 `letter-spacing:.1em` uppercase `rgba(245,234,216,.5)`, `margin-top:2px`.
- Exactly **three** marks: **First light** (civil twilight begin), **Sunrise**, **Golden ends** (sun reaches 6° altitude). They are ~28 minutes apart at this latitude, which is the spacing the centered-label layout needs; a fourth mark closer than ~20 minutes to its neighbour will collide at this width. If you ever add one, stagger it onto its own row above the bar instead of squeezing the lower row.

Fixed window, not a fitted one: over a year the three marks drift across the bar (and in deep winter would run past 7:30). Widen the window seasonally — pick the span from the month's own range, e.g. 6:30–8:30 in December — rather than making it elastic per day.

### Condition cards

Two cards, `display:grid; grid-template-columns:1fr 1fr; gap:8px`. Each: `border-radius:18px; background:rgba(255,255,255,.07); padding:13px 15px`. Card kicker Figtree 8.5px/600 `letter-spacing:.12em` uppercase `rgba(245,234,216,.45)`; the figure under it Caprasimo 22px `#f5ead8`, `margin:2px 0 5px`.

**Card 1 — CLOUD.** Figure = total cloud cover as a percentage. Under it the band meter, which is the heart of the whole screen:

- Track: `height:5px; border-radius:999px; background:rgba(255,255,255,.14)`.
- **Colour band**: `position:absolute; left:30%; width:40%; top:0; bottom:0; background:rgba(122,138,94,.5)` — the sage 30–70% zone where cloud actually catches light.
- Knob: 11px circle at `left:<cloud>%`, `margin-left:-5.5px; top:-3px`, fill = the tone's `dark` value.
- Caption under: "90% low cloud" — Figtree 10.5px `rgba(245,234,216,.6)`. Always name the **level** (low / mid / high cloud, or "clear" / "rain"), because 45% high cloud and 45% low cloud are opposite news.

The band is what makes the number mean something: inside it, colour is likely; below it the sky is empty; above it you get grey. Keep the band fixed at 30–70% — it is a claim about sunrises, not a computed value.

**Card 2 — OUT THERE.** Figure = temperature at sunrise. Under it two lines of Figtree 10.5px/1.5 `rgba(245,234,216,.6)`:
`feels 56° · 9 mph WSW` / `Rain 10% · fog High`.
Fog is reported separately from cloud on purpose — a coastal marine layer is the difference between a grey window and being above it, and it does not show up in a total-cloud number.

### Divider

`height:1px; background:rgba(245,234,216,.14); margin:22px 0 20px`.

### The week ahead

Kicker "THE WEEK AHEAD" (Figtree 9.5px/600, `letter-spacing:.14em`, uppercase, `rgba(245,234,216,.45)`, `margin-bottom:10px`), then seven equal tiles, `display:flex; gap:6px`:

- Tile: `flex:1; border-radius:14px; background:rgba(255,255,255,.07); padding:9px 0 10px; text-align:center; cursor:pointer`.
- Weekday initial: Figtree 9px/600, `letter-spacing:.08em`, uppercase, `rgba(245,234,216,.5)`.
- Date number: Caprasimo 13px `#f5ead8`, `margin:3px 0 6px`.
- Verdict dot: 9px circle, `margin:0 auto`, fill = that day's tone `dark` value.
- Selected day only: a 2px underline, `border-radius:999px`, same colour, `margin:8px 9px 0`.

Under the row, the drift line: "Sunrise drifts 6:24 → 6:30 across the week. Tap a day to plan it." — Figtree 11px `rgba(245,234,216,.5)`, `margin-top:10px`.

**Tapping a tile re-targets the entire view above it** — verdict, reason line, timeline marks, both cards and the header kicker. This is the screen's only real interaction, and it is what makes the view worth having: the owner can see on Tuesday night that Friday is the one to plan around. Seven days, no further — forecasts past that are not honest enough to put a word on.

---

## Verdicts

The verdict is a single word derived server-side, plus a tone that colours the word, the cloud knob and the week-ahead dot. Never show the numeric score, and never show a star rating.

| Word | When | Tone | Colours (`fill` / `dark` on the dark ground) |
| --- | --- | --- | --- |
| **Promising** | 30–70% cloud, mostly mid/high, horizon clear, rain < 20%, fog not high | 5 | `--color-accent` #c67139 / `#e0954f` |
| **Good** | 20–80% cloud, mid/high, rain < 30% | 4 | `--color-accent-2-600` / `#a8b884` |
| **Bare** | under 20% cloud — clean sky, little colour, good silhouettes | 3 | `--color-neutral-500` / `rgba(245,234,216,.7)` |
| **Socked in** | 80%+ **low** cloud, or fog probability high | 2 | `--color-neutral-400` / `rgba(245,234,216,.5)` |
| **Wet** | rain probability 50%+ | 1 | `--color-neutral-400` / `rgba(245,234,216,.5)` |

Resolution order: **Wet** wins over everything, then **Socked in**, then the cloud-band bands. A day inside the colour band that is also raining is Wet — the sky may be interesting but the morning is not.

Tone colours carry no information the word does not; the word is the accessible signal. Terracotta only ever means "worth getting up for", so it must not be used decoratively anywhere on this screen.

**Reason line** — one or two sentences, written from the same inputs, in the app's voice: plain, specific, never hedged into uselessness, never gamified. What the prototype ships with, as the tone reference:

- Promising — "High cloud at 45% — the kind that lights up. Clear at the horizon."
- Socked in — "Marine layer to 1,100 ft. Above it if you go high, grey if you don't."
- Bare — "Empty sky. Little colour, but clean silhouettes."
- Good — "Scattered mid cloud, warm morning."
- Wet — "Rain through the morning. Sleep in."

Generate these from a small set of templates keyed on the deciding factor (cloud level + band, fog ceiling, rain), not from an open-ended model — the voice matters more than the variety, and "Sleep in." is the app being honest, not funny.

---

## Data

Per day, seven days out:

```
{ date,
  sunrise, civilTwilightBegin, goldenHourEnd,     // local time
  cloudTotal, cloudLow, cloudMid, cloudHigh,      // % at sunrise
  tempAtSunrise, apparentTemp, windSpeed, windDir,
  precipProbability, fogProbability, ceilingFt,
  verdict, score, reason }                        // derived server-side
```

- **Source**: Open-Meteo covers all of it without a key — hourly `cloudcover_low/mid/high`, `temperature_2m`, `apparent_temperature`, `windspeed_10m`, `precipitation_probability`, `visibility`, plus daily `sunrise`. Sample the hour containing sunrise (interpolate if you want to be precise). Civil twilight and the 6°-altitude golden-hour end are solar-position maths, not an API call — compute them from lat/long and date.
- **Derive the verdict on the server**, next to the ingest that already computes `stats` — the phone and the web view must never disagree about whether tomorrow is Promising.
- **Cadence**: refresh when the view opens if the cached forecast is older than 3 hours, plus once in the evening (around 20:00 local) so the entry row is current at bedtime. A forecast is a forecast — nothing here needs to be live.
- **Location**: the owner's home coordinates, set once, from the calendar's existing settings. This screen has no location UI.

---

## Behaviour

| Trigger | Result |
| --- | --- |
| Tap the "Plan tomorrow" row on the calendar | Open the planning view, targeted at tomorrow |
| Tap "Calendar" | Return to the calendar, scrolled where it was |
| Tap a day in the week-ahead row | Re-target the whole view to that day; header kicker, verdict, reason, timeline, both cards and the selected underline all update |
| Open the view after midnight but before that morning's golden-hour end | Target **today** and label it "This morning" / "PLANNING THIS MORNING"; the week-ahead row starts with today |
| Open with no cached forecast | Skeleton: the timeline bar and both cards at `rgba(255,255,255,.07)` with no figures, verdict area blank — never a spinner |
| Forecast fetch fails | Keep the last forecast and stamp the reason line "Forecast from 9:12 PM — couldn't refresh."; if there is nothing cached, one quiet line and a "Try again" text button. Never block the calendar |
| Tomorrow's photo arrives (the walk happened) | The entry row reverts to tomorrow's forecast; the planning view is never a record of the past — that is the calendar's job |

## Motion

`MOTION.md` is the authority. Two transitions are new:

- **Calendar → planning view**: cross-fade over 480ms with an 8px rise on the planning content; the reverse is the same, no slide, no scale. The two screens are peers, not a stack.
- **Day switch in the week-ahead row**: 240ms cross-fade on the verdict, reason line and card figures; the timeline **ticks and labels tween to their new positions** rather than fading — they only move a few pixels, and seeing them move is the point. The bar gradient never animates.

Nothing pulses, nothing counts up. The screen is read in the dark, half asleep.

## Accessibility

- The verdict word — never colour alone — carries the meaning, in the header, the entry row and (via the day number + dot) the week-ahead row. Give each week-ahead tile an accessible label like "Friday 14, Bare".
- All five tone `dark` values clear 4.5:1 on `#17140f`; the 42px verdict has margin to spare.
- The whole screen is dark by design and does not follow the system light/dark setting — the calendar stays cream, this stays near-black. If the platform demands it, honour "increase contrast" by lifting the card fills from `.07` to `.12` and the body text from `.78` to `.9`.
- Respect reduced-motion: cross-fades become instant swaps; the tick tween is dropped.

## Screenshots

In `screenshots/`, captured at 2×:

| File | State |
| --- | --- |
| `3c-night-promising.png` | Planning view, tomorrow, verdict "Promising" — the default state |
| `3c-night-socked-in.png` | Planning view re-targeted to Thursday from the week-ahead row, verdict "Socked in" — shows the two-line reason at its reserved height and a 90% cloud knob past the band |
| `3c-calendar-entry.png` | The calendar with the dark "Plan tomorrow" entry row |
