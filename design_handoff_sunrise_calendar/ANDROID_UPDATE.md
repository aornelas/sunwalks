# Android update spec — Sunrise Calendar

An **update** to the app already built from `design_handoff_sunrise_calendar/README.md`. Nothing here changes the visual design: same layouts, colors, type, states. It changes the platform plumbing that the original spec wrote against iOS, and tunes asset/rendering choices for the target device.

Target device: **Google Pixel 10 Pro XL**, Android 16, Chrome.

Apply as a set of independent changes — none of them depend on each other except where noted.

---

## 0. Device profile to develop against

| Property | Value |
| --- | --- |
| Panel | 6.8" LTPO OLED, 1344 × 2992 physical px, 486 ppi, 20:9 |
| Refresh | 1–120 Hz adaptive |
| Brightness / gamut | HDR10+, very high peak brightness, wide (P3) gamut |
| Chrome CSS viewport (portrait, gesture nav) | ~**448 × 998 px** at devicePixelRatio ≈ 3 |
| Chrome CSS viewport (landscape) | ~**998 × 448 px** |

Verify the exact CSS viewport on the real device before hard-coding anything (`window.innerWidth/innerHeight`, `devicePixelRatio`) — the phone can be set to a lower render resolution and to a non-default display size, both of which change it.

**Consequence for layout:** the design was drawn at 402 px wide; this phone gives ~448. Do not scale the design up. Keep the type sizes and cell radii as specified and let the 7-column grid absorb the extra width — day squares grow from ~48 px to ~55 px, which is the intended behavior. Everything in the design that was a fixed width should already be fluid; the only fixed numbers that must change are the safe-area paddings in §1.

---

## 1. Safe areas — replace the iOS-shaped padding

The original spec hard-coded `54px` of top padding (iPhone dynamic island) and `14px` bottom offsets (home indicator). Both are wrong here: this phone has a small punch-hole camera and either a gesture pill or a 3-button nav bar.

1. Add `viewport-fit=cover` to the viewport meta so `env()` insets resolve:
   ```html
   <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
   ```
2. Replace the fixed paddings:
   - Main scroll container top padding: `calc(env(safe-area-inset-top, 0px) + 14px)` (was `54px`).
   - Floating Week/Month/Year bar bottom offset: `calc(env(safe-area-inset-bottom, 0px) + 14px)` (was `14px`).
   - Main scroll container bottom padding: `calc(env(safe-area-inset-bottom, 0px) + 96px)`.
   - Photo-view top bar padding: `calc(env(safe-area-inset-top, 0px) + 12px)` (was `52px`).
   - Settings bottom sheet: `padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 26px)`.
   - Landscape photo view: left/right chrome insets become `calc(env(safe-area-inset-left, 0px) + 22px)` / `...-right...`. The prev chevron's `52px` offset existed only to clear the iPhone island — on Android use the same `22px` as the next chevron, plus the left inset.
3. Draw edge-to-edge: the cream ground should run under the status bar and nav bar rather than leaving letterbox bands.

## 2. Viewport height — never use `vh`

Chrome's address bar shows and hides on scroll. Any `100vh` or `height:100%` chain that assumed a stable viewport must use `100dvh` (with a `100vh` fallback line before it). This affects the photo-view overlay, the landscape view and the bottom-sheet backdrop. Symptom if missed: the floating control bar drifts under the URL bar mid-scroll.

## 3. Hardware back — every overlay becomes a history entry

Android has a back gesture and (in 3-button mode) a back button. Today the photo view, the settings sheet and the landscape view are pure component state, so back exits the app — the single worst bug on this platform.

- Push a history entry when opening: photo view (`?d=2026-08-11`), settings sheet (`#settings`), landscape is the same route as the photo view.
- `popstate` closes the topmost overlay instead of navigating.
- Stepping between days with the chevrons should `replaceState`, not `pushState` — back from the 14th shouldn't walk you back through nine days.
- Closing the last overlay returns to the calendar; back from the calendar exits, as expected.
- Bonus that falls out of this: `/​?d=2026-08-11` deep-links a specific morning, which is also what the share button should send.

## 4. Gesture navigation vs. horizontal swipes

The back gesture owns roughly the outer 24 dp of both edges. If you added swipe-between-days in the photo view, it will fight the system gesture and lose.

- Keep the on-screen chevrons as the primary control (they're in the design for this reason).
- If swipe stays, start the drag only from touches that begin more than 24 dp from either edge, and don't attempt to suppress the system gesture.
- Vertical swipe-down-to-dismiss on the photo view is safe and worth adding.

## 5. Touch targets — Material minimum is 48 dp

The 34 px round icon buttons (refresh, gear, close, share, chevrons) are below Android's 48 dp minimum. **Keep the 34 px visual size** — enlarging them would change the design — and enlarge only the hit area: wrap each in a 48 × 48 transparent tappable element, or add `padding:7px; margin:-7px` around the visual circle. The same applies to the thumbnail strip: 62 px thumbs are fine, the 8 px "day photo" dot is decorative and must not be the tap target.

## 6. Share — use the native sheet

Replace the share button's behavior with the Web Share API, falling back to copy-to-clipboard:
```js
if (navigator.share) await navigator.share({ title: 'Sunrise — August 11', url: dayUrl });
else await navigator.clipboard.writeText(dayUrl);
```
`navigator.share({ files: [...] })` also works in Chrome on Android if you want "share the photo itself" rather than the link — offer the link by default, since the photo lives in Google Photos already.

## 7. Installed-app polish (PWA)

The point of installing is that it opens like an app and the system chrome matches the cream ground.

- `manifest.webmanifest`: `"display": "standalone"`, `"orientation": "portrait"` (see §8), `"background_color": "#f5ead8"`, `"theme_color": "#f5ead8"`, `"start_url": "/?source=pwa"`.
- `<meta name="theme-color" content="#f5ead8">` — Android tints the status bar with it and, because the color is light, switches the status-bar icons to dark. Add a second `theme-color` in a `(prefers-color-scheme: dark)` media query only if you ever ship a dark theme; the design is light-only, so leave it out and do **not** react to system dark mode.
- Icons: 192, 512, plus a **maskable** 512 with the artwork inset to the safe circle — Android crops non-maskable icons into a squircle. A single sunrise square on the cream ground reads well at launcher size.
- Optional shortcut in the manifest: "Today" → `/?d=today`, long-press on the launcher icon.

## 8. Orientation — portrait-locked except the photo view

The landscape photo view (option `2a`) is the only rotating surface.

- Manifest declares `"orientation": "portrait"`.
- On the photo-view route, call `screen.orientation.unlock()` on mount and `screen.orientation.lock('portrait')` on unmount. Both are supported in Chrome on Android (and both need to be wrapped in try/catch — they reject when not installed/fullscreen).
- If the user has system auto-rotate off, the landscape view is unreachable; that's acceptable, and no fallback UI is needed.
- The landscape layout should key off `(orientation: landscape)`, not a JS breakpoint, so it also works when the phone is rotated while the view is already open.

## 9. Images — resolution and color for this panel

devicePixelRatio ≈ 3 and 486 ppi, so the original two-size asset plan under-serves the panel.

| Use | CSS size | Serve |
| --- | --- | --- |
| Month grid square, year dot | ~55 px | 192 px square (3×) |
| Last-7 strip circle | ~55 px | 192 px square |
| Week card | ~105 px | 320 px square |
| Photo view (portrait) | 448 px wide | 1344 px long edge |
| Landscape photo view | 998 px wide | 2048 px long edge |

- Use `srcset` with 1×/2×/3× so cheaper devices and the shared link don't pay for 3×.
- Prefer AVIF with a WebP fallback; a grid of ~40 visible squares is the heaviest thing on screen.
- `loading="lazy"` on everything below the first two month blocks, `fetchpriority="high"` on the last-7 strip.
- The panel is wide-gamut: export derivatives in **Display P3** with the ICC profile embedded (sunrise oranges clip noticeably in sRGB on this screen). Keep the UI colors in sRGB hex as specified — the design system's cream/terracotta must not shift.
- Do not apply HDR gain maps: the calendar is a grid of small thumbnails and HDR highlights make it flicker as you scroll.

## 10. Rendering at 120 Hz

- Animate `transform` and `opacity` only. The photo-view open/close should be a transform-scale + opacity fade, not width/height.
- `backdrop-filter: blur(14px)` on the floating control bar and the landscape chrome is fine on Tensor G5, but it must not be applied to an element that also animates. Keep the bar static and let content scroll under it.
- Add `content-visibility: auto` + a `contain-intrinsic-size` on each month block so scrolling a year of history stays at 120 fps.
- Avoid `position: fixed` inside the scroll container — use `sticky` for the weekday header row.

## 11. System font scale and display size

Pixel users frequently raise font size and display size in Settings. Chrome honors both.

- Use `rem`/`em` for type so the app scales with the user's setting; do not lock text in `px`.
- The day squares must stay square (`aspect-ratio: 1`) regardless of scale — the date number is allowed to be clipped visually rather than blowing out the grid; test at the maximum font-size setting.
- The stats line already uses `white-space: nowrap` per stat; at large text it should wrap between stats, never mid-stat.

## 12. Misc Android correctness

- `<meta name="mobile-web-app-capable" content="yes">` (the `apple-` variants can stay for iOS parity).
- Disable pull-to-refresh on the calendar (`overscroll-behavior-y: contain`) or wire it to the album fetch — the second is nicer: the gesture already means "refresh" on Android.
- Suppress the tap highlight: `-webkit-tap-highlight-color: transparent`, and add the design system's own pressed states so taps still feel answered.
- Keep the settings sheet as a bottom sheet with a drag handle — that's native Material behavior and matches the current design.
- Test with both gesture navigation and 3-button navigation; the 3-button bar is 48 dp tall and is exactly what the `env(safe-area-inset-bottom)` change in §1 protects against.

---

## Acceptance checklist (on the Pixel 10 Pro XL)

- [ ] Cream ground runs under the status bar; status-bar icons are dark; no white or black band anywhere.
- [ ] Floating Week/Month/Year bar clears the gesture pill **and** the 3-button nav bar.
- [ ] Back gesture closes the photo view → the sheet → then exits. Never exits with an overlay open.
- [ ] Back from a day nine chevron-steps deep returns to the calendar in one press.
- [ ] Rotating in the photo view goes landscape; rotating on the calendar does nothing.
- [ ] Share opens the Android share sheet with a working deep link.
- [ ] Installed from Chrome: launches standalone, cream splash, maskable icon, portrait-locked.
- [ ] Address bar showing or hidden, the layout doesn't shift and the control bar stays put.
- [ ] All icon buttons pass a 48 dp hit test while still drawing at 34 px.
- [ ] Scrolling six months of grid holds 120 fps; sunrise oranges look right, not clipped or flickering.
- [ ] At maximum system font size nothing overlaps and the squares stay square.
