# Sunwalks — icon & rebrand assets

The app is renamed **Sunrise Calendar → Sunwalks**. This folder carries the new mark and every file the Android/PWA install needs.

The mark is a sunrise on a walked horizon: the horizon line is drawn as four dashes that lengthen as they approach the sun, so the ground itself reads as a stride. Three rays, round caps, the same geometry as the sunrise glyph already in the app's filter bar.

## Files

| File | Use |
| --- | --- |
| `sunwalks-icon.svg` | Master vector, 512 square, cream ground. Source of truth — regenerate the PNGs from this, never from a PNG. |
| `icon-512.png` / `icon-192.png` | `manifest.json` icons, `purpose: "any"` |
| `icon-maskable-512.png` | `manifest.json`, `purpose: "maskable"` |
| `sunwalks-icon-foreground.svg` / `adaptive-foreground-432.png` | Android adaptive icon foreground layer (transparent) |
| `sunwalks-icon-background.svg` / `adaptive-background-432.png` | Android adaptive icon background layer (flat `#f5ead8`) |
| `favicon-32.png` | Browser tab |
| `apple-touch-icon-180.png` | iOS home screen, if the PWA is ever installed there |

## Geometry contract

All art sits inside a centred 400px circle of the 512 frame (furthest point 179 of a 200 radius). That clears both Android's adaptive-icon crop — squircle through full circle — and a maskable PWA crop, so `icon-512.png` and `icon-maskable-512.png` are intentionally the same drawing: the master is already maskable-safe. The foreground layer is the same art scaled to 78% so it survives the tighter 66/108dp adaptive guarantee.

Colours are the app's own tokens, unchanged: ground `#f5ead8`, sun `#c67139`, horizon `#7a8a5e`.

## Wiring

```json
{
  "name": "Sunwalks",
  "short_name": "Sunwalks",
  "theme_color": "#f5ead8",
  "background_color": "#f5ead8",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

```html
<link rel="icon" href="/icons/sunwalks-icon.svg" type="image/svg+xml">
<link rel="icon" href="/icons/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png">
<meta name="theme-color" content="#f5ead8">
```

Android native (if the app is ever wrapped rather than installed as a PWA): `adaptive-foreground-432.png` → `ic_launcher_foreground`, background as a colour resource `#f5ead8` rather than the PNG, and let the launcher composite them.

## Rename checklist

Beyond the icons, the string changes are: `manifest.json` `name`/`short_name`, `<title>`, the install prompt copy, the share-sheet title, and any "Sunrise Calendar" in the settings sheet header. The word "sunrise" still applies to the *photographs* — a sunrise is what you shoot, a sunwalk is what you did — so don't blanket find-and-replace it; only the product name changes.

## Not in this folder

There is no walker in the icon. A foot is legible only through its asymmetry — straight outer edge against the concave arch — which needs about a third of the icon's width to survive, and at that size it crowds the sun. The walker belongs in a horizontal wordmark lockup for the splash screen, settings header and store listing, where it has the width to read. That lockup is not drawn yet.
