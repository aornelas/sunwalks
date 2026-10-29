import { NextRequest, NextResponse } from "next/server";
import { isCronRequest } from "@/lib/cron-auth";
import { todayDayKey } from "@/lib/dates";
import { env } from "@/lib/env";
import { configuredBotApi, sendWeeklySummary } from "@/lib/walk-buddy";

// Weekly (see vercel.json): what the calibration learned over the last
// seven mornings, sent to the owner's Telegram chat.
export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const api = configuredBotApi();
  const chatId = env.telegramChatId;
  if (!api || !chatId) return NextResponse.json({ skipped: "Telegram isn't configured" });
  await sendWeeklySummary({ api, chatId }, todayDayKey(env.timezone));
  return NextResponse.json({ sent: true });
}
