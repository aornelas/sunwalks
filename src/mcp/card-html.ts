// The planning card as one self-contained HTML document: the view script,
// bundled with its MCP Apps dependency by esbuild, inlined into the page.
// Built once per server process, on first read.

import { build } from "esbuild";
import path from "node:path";

const STYLE = `
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body {
  margin: 0;
  background: #17140f;
  color: #f5ead8;
  font: 15px/1.45 "Figtree", system-ui, -apple-system, "Segoe UI", sans-serif;
}
#card { padding: 20px 20px 16px; max-width: 760px; margin: 0 auto; }
.eyebrow { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: rgba(245,234,216,.5); }
.word { font: 400 44px/1.05 "Caprasimo", Georgia, serif; margin: 6px 0 12px; }
.meter { height: 4px; border-radius: 2px; background: rgba(255,255,255,.12); overflow: hidden; }
.meter span { display: block; height: 100%; }
.note { margin: 8px 0 0; font-size: 13px; color: rgba(245,234,216,.6); }
.message { margin: 16px 0 18px; color: rgba(245,234,216,.9); }
.spots { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }
.spot { background: rgba(255,255,255,.07); border-radius: 14px; overflow: hidden; display: flex; flex-direction: column; }
.spot.best { box-shadow: inset 0 0 0 1px rgba(245,234,216,.45); }
.frame { position: relative; aspect-ratio: 1; background: rgba(255,255,255,.04); display: grid; place-items: center; }
.frame.empty { aspect-ratio: auto; height: 64px; }
.frame img { width: 100%; height: 100%; object-fit: cover; display: block; }
.stamp { position: absolute; left: 8px; bottom: 8px; padding: 2px 8px; border-radius: 999px; font-size: 11px; background: rgba(23,20,15,.6); color: rgba(245,234,216,.9); }
.nophoto { font-size: 12px; color: rgba(245,234,216,.45); }
.body { padding: 12px 14px 14px; }
.rank { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: rgba(245,234,216,.5); }
.name { font-size: 17px; font-weight: 600; margin: 2px 0 6px; }
.reason { margin: 0; font-size: 13px; color: rgba(245,234,216,.78); }
.foot, .empty { margin: 14px 0 0; font-size: 12px; color: rgba(245,234,216,.45); }
`;

let html: Promise<string> | null = null;

export function planningCardHtml(): Promise<string> {
  html ??= build({
    entryPoints: [path.join(process.cwd(), "src", "mcp", "card", "view.ts")],
    bundle: true,
    format: "esm",
    minify: true,
    write: false,
    platform: "browser",
    target: "es2022",
  }).then(({ outputFiles }) => {
    // Escaped so the bundle can't close the script element early.
    const script = outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sunwalks plan</title>
<style>${STYLE}</style>
</head>
<body>
<main id="card" aria-live="polite"></main>
<script type="module">${script}</script>
</body>
</html>`;
  });
  return html;
}
