# Motion spec — Sunrise Calendar

An addition to `README.md`. Nothing here changes layout, color or copy — it defines how the interface moves. Live reference: **`Sunrise Motion.dc.html`** in this bundle, where all nine motions play at real timing (with a quarter-speed toggle to read the curves).

Principle: the photographs are the event; motion exists to keep them continuous. Nothing bounces, nothing celebrates, nothing announces itself. If a transition draws attention to the transition, it is wrong.

Pace: this app is used at dawn, on purpose, slowly. Every duration below is deliberately about twice a conventional UI's — soothing, not activating. Do not "optimise" them back down to platform defaults; the unhurried pace is the design.

## Tokens

```css
--dur-instant:    240ms;   /* state flips: pill fill, toggle knob */
--dur-quick:      360ms;   /* cross-dissolves, caption swaps */
--dur-base:       480ms;   /* the default for anything entering */
--dur-expressive: 760ms;   /* the shared-element photo open */
--dur-entrance:   1040ms;   /* first paint of the calendar */

--ease-standard: cubic-bezier(.2, 0, 0, 1);    /* things arriving */
--ease-soft:     cubic-bezier(.34, .9, .3, 1); /* things settling */
--ease-exit:     cubic-bezier(.4, 0, 1, 1);    /* things leaving */
```

Leaving is always faster than arriving. Use `--ease-exit` for anything being dismissed and cut the duration by roughly a third.

## The nine motions

| # | Motion | Spec |
| --- | --- | --- |
| 1 | **Calendar settles in** | Squares fade in `opacity 0→1`, `scale .68→1`, 720ms `soft`, staggered 52ms by `(row + col)` so the wave runs diagonally from top-left. First paint only — never on scroll, never on filter, never when returning from the photo view. |
| 2 | **Square opens** | Shared element: the tapped square's rect becomes the `transform-origin`, and it scales up to fill the frame. 760ms `standard`. Scrim `0→1` over 480ms. The opening square keeps its own thumbnail painted for the whole dissolve — the photo layer must never cross-fade against an empty or black layer, or the open flashes. Chrome (top bar, caption, thumbnail strip) fades in at +360ms — after the photo has landed, never with it. Close reverses at 520ms `exit`, back to the same square. |
| 3 | **Changing zoom** | Outgoing grid `opacity→0, scale→.965` 320ms `exit`; incoming `opacity 0→1, scale 1.035→1` 480ms `standard` at +160ms. The selected pill's fill slides under the tapped label, `transform` 560ms `soft`. Never slide grids sideways — the zoom is a change of scale, not of place. |
| 4 | **Filtering the gaps out** | FLIP. Measure survivor positions, collapse the empty squares (`width→0, scale→.4, opacity→0`, 400ms `exit`), then transform the survivors to their new positions over 600ms `soft`, no stagger. Turning the filter off plays the same motion in reverse so the gaps reappear where they were. |
| 5 | **A new morning lands** | The reward moment. Refresh icon rotates 720° over 1800ms `linear`, looping while the fetch is pending. On arrival the new square pops `scale .35→1.07→1`, 840ms `soft` — the only overshoot in the app. One accent ripple: `box-shadow 0 0 0 0 → 0 0 0 14px rgba(198,113,57,…)`, fading over 1240ms. Sync line cross-fades last. Multiple new days stagger 160ms apart, capped at five. |
| 6 | **Choosing the day's photo** | The viewing ring translates between thumbnails, 440ms `soft` — it never blinks from one to another. It travels exactly one thumbnail pitch (thumb width + gap) and lands flush on the target rect: `soft` settles here, it does not spring past. Any visible overshoot is a bug. On commit, the calendar square cross-dissolves between old and new photo over 520ms `standard`, and the button settles into its inert "Day photo" state with a 400ms fade + 4px rise. |
| 7 | **Settings sheet** | Panel `translateY(100%)→0`, 600ms `soft`; scrim `0→1`, 480ms. Drag tracks the finger one-to-one; release either springs back (400ms `soft`) or dismisses, with the dismiss duration scaled to the fling velocity, floor 280ms. Dismiss without a drag is 400ms `exit`. |
| 8 | **Stats tick up** | `translateY` roll through a column of integers, one row per step, 1120ms `soft`. Only after a sync that brought something new, and only for the figures that actually changed. Caps at six steps — beyond that, set the value directly. Never on first load. |
| 9 | **Stepping between mornings** | Photo `translateX` a full width in the direction of travel, 600ms `standard`. The caption does not ride along: it cross-dissolves in place over 360ms at +120ms, so the date stays readable through the move. At the end of history, a 12px rubber-band and 400ms return. |

## Micro-states

These are not in the demo file but follow the same tokens:

- **Press**: any tappable square or pill scales to `.97` over 200ms while held, returns over `--dur-quick` `soft`. Icon buttons tint one ramp step instead of scaling.
- **Pill / toggle flips**: `--dur-instant`, `standard`, on `background-color` and the knob's `transform` — both cheap.
- **Copy link**: label cross-fades to "Link copied" over 280ms, holds 1.8s, cross-fades back. No checkmark animation.
- **Scroll**: native and continuous. Month blocks that load as you scroll back through history appear with motion 1 disabled — a plain 360ms fade, no stagger, or it feels like the page is re-rendering.
- **Sticky weekday header**: no shadow transition, no shrink. It just stays.

## Implementation rules

1. **Animate `transform` and `opacity` only.** Every motion above compiles down to those two, with one exception: the width collapse in motion 4, bounded to the seven cells of a row. Never animate `top/left/width/height` on the grid at large.
2. **Promote, then release.** Set `will-change` on the element being animated at the start and remove it on `animationend`. A permanently promoted grid of 300 squares will exhaust memory on mid-range phones.
3. **Never blur behind a moving element.** The floating control bar's `backdrop-filter` is fine because the bar itself never moves — content scrolls under it. Do not animate any element that has a backdrop filter.
4. **120 Hz budget: 8.3ms a frame.** Test motions 1 and 4 with a full year of squares in the DOM. If either can't hold frame rate, cut the stagger first, then the motion. The photos matter more than the transition.
5. **Interruptibility.** Every motion must be reversible mid-flight — tapping a second day while the first is still opening should retarget, not queue. Use the Web Animations API (`element.animate()`) rather than CSS classes so you hold a handle on the running animation.
6. **Motion is never the only signal.** Every state change must also be legible in a static screenshot.

## Reduced motion

Under `prefers-reduced-motion: reduce`:

- All movement becomes a 240ms opacity cross-fade. Stagger drops to zero.
- Motion 2 (shared element) becomes a plain fade — no scale, no travel.
- Motion 4 (FLIP) has no transition at all: the layout simply changes.
- Motion 5 keeps the ripple but drops the pop and the icon spin; the spinner becomes a static "Fetching…" line.
- Motion 8 is skipped — numbers set directly.

Wire this to a single `--motion-scale` variable (1 or 0) that the durations multiply against, plus a media-query override, so it can be verified in one place.
