// The planning card's script, running in the host's sandboxed iframe. It
// receives recommend_walk's result and draws it; there's nothing to pick,
// since the owner decides in the morning.

import { App } from "@modelcontextprotocol/ext-apps";

interface CardSpot {
  spot: string;
  reason: string;
  photo: { id: string; date: string; sky: string | null; alt: string; dataUrl: string } | null;
}

interface Plan {
  date: string;
  category: string;
  confidence: number;
  confidenceNote: string;
  message: string;
  spots: CardSpot[];
}

// Matches toneFor(...).dark in src/lib/verdict.ts.
const TONE: Record<string, string> = {
  Stunning: "#e0954f",
  Nice: "#a8b884",
  Clear: "rgba(245,234,216,.7)",
  Foggy: "rgba(245,234,216,.5)",
  Wet: "rgba(245,234,216,.5)",
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, textContent?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textContent != null) node.textContent = textContent;
  return node;
}

function longDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

function shortDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function render(root: HTMLElement, plan: Plan | null): void {
  root.replaceChildren();
  if (!plan) {
    root.append(el("p", "empty", "No plan for tomorrow yet. The evening job makes one; ask to plan it now if you'd like."));
    return;
  }

  const head = el("header", "head");
  head.append(el("div", "eyebrow", `Sunrise · ${longDate(plan.date)}`));
  const word = el("h1", "word", plan.category);
  word.style.color = TONE[plan.category] ?? TONE.Clear;
  head.append(word);
  const meter = el("div", "meter");
  const fill = el("span");
  fill.style.width = `${Math.round(plan.confidence * 100)}%`;
  fill.style.background = TONE[plan.category] ?? TONE.Clear;
  meter.append(fill);
  head.append(meter, el("p", "note", `${Math.round(plan.confidence * 100)}% · ${plan.confidenceNote}`));
  root.append(head, el("p", "message", plan.message));

  const list = el("ol", "spots");
  plan.spots.forEach((s, i) => {
    const item = el("li", i === 0 ? "spot best" : "spot");
    const frame = el("div", "frame");
    if (s.photo) {
      const img = el("img");
      img.src = s.photo.dataUrl;
      img.alt = s.photo.alt;
      frame.append(img, el("span", "stamp", [shortDate(s.photo.date), s.photo.sky].filter(Boolean).join(" · ")));
    } else {
      frame.classList.add("empty");
      frame.append(el("span", "nophoto", s.spot === "Home" ? "From the window" : "No photo from here yet"));
    }
    const body = el("div", "body");
    body.append(el("div", "rank", i === 0 ? "Best bet" : "Also good"), el("h2", "name", s.spot), el("p", "reason", s.reason));
    item.append(frame, body);
    list.append(item);
  });
  root.append(list, el("p", "foot", "A suggestion. Report where you went in the morning."));
}

const root = document.getElementById("card")!;
const app = new App({ name: "Sunwalks planning card", version: "0.1.0" });
// Set before connect, so the first result isn't missed.
app.ontoolresult = (result) => {
  const plan = (result.structuredContent as { plan?: Plan | null } | undefined)?.plan ?? null;
  render(root, plan);
};
void app.connect();
