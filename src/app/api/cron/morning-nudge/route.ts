import { NextRequest, NextResponse } from "next/server";
import { isCronRequest } from "@/lib/cron-auth";
import { todayDayKey } from "@/lib/dates";
import { env } from "@/lib/env";
import { configuredBotApi, sendMorningNudge } from "@/lib/walk-buddy";

// Late morning (see vercel.json): if nothing has come in for today, asks
// for the photo and offers "Slept in". Sends nothing once there's a report.
export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const api = configuredBotApi();
  const chatId = env.telegramChatId;
  if (!api || !chatId) return NextResponse.json({ skipped: "Telegram isn't configured" });
  const sent = await sendMorningNudge({ api, chatId }, todayDayKey(env.timezone));
  return NextResponse.json({ sent });
}
