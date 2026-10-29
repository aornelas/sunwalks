import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { isCronRequest } from "@/lib/cron-auth";
import { env } from "@/lib/env";
import { configuredBotApi, sendEveningPlan } from "@/lib/walk-buddy";

// A plan is a short tool loop, well inside this.
export const maxDuration = 300;

// Nightly (see vercel.json), after the forecast cron: plans the next
// morning and sends it to the owner's Telegram chat with a button per spot.
export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const api = configuredBotApi();
  const chatId = env.telegramChatId;
  if (!api || !chatId) return NextResponse.json({ skipped: "Telegram isn't configured" });
  const usage = await sendEveningPlan({ api, client: new Anthropic(), chatId });
  return NextResponse.json({ sent: true, usage });
}
