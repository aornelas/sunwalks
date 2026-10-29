import Anthropic from "@anthropic-ai/sdk";
import { after, NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { isFromOwner, SECRET_HEADER, secretMatches, type TelegramUpdate } from "@/lib/telegram";
import { claimUpdate, configuredBotApi, handleUpdate } from "@/lib/walk-buddy";

// Handling (a photo tag plus a tool loop) runs after the response.
export const maxDuration = 300;

// Telegram's webhook (registered by `npm run telegram -- set-webhook`).
// Two checks before anything is read: the secret Telegram echoes in a
// header, and the owner's own chat ID. Updates from anyone else get an
// empty 200, so Telegram stops redelivering them and learns nothing.
export async function POST(req: NextRequest) {
  const secret = env.telegramWebhookSecret;
  const api = configuredBotApi();
  const chatId = env.telegramChatId;
  if (!secret || !api || !chatId || !secretMatches(req.headers.get(SECRET_HEADER), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const update = (await req.json().catch(() => null)) as TelegramUpdate | null;
  if (!update || typeof update.update_id !== "number" || !isFromOwner(update, chatId)) {
    return NextResponse.json({ ok: true });
  }
  if (!(await claimUpdate(update))) return NextResponse.json({ ok: true, duplicate: true });

  // Telegram waits for the response and redelivers on a timeout, so the
  // work happens after answering; claimUpdate already made it run once.
  after(() => handleUpdate({ api, client: new Anthropic(), chatId }, update));
  return NextResponse.json({ ok: true });
}
