// Sets up and pokes the walk buddy's Telegram bot.
//   npm run telegram -- chats          lists chats that messaged the bot (find TELEGRAM_CHAT_ID; only works before set-webhook)
//   npm run telegram -- set-webhook    points the bot at SITE_URL/api/telegram with TELEGRAM_WEBHOOK_SECRET
//   npm run telegram -- info           shows the webhook Telegram has on file, and its last error
//   npm run telegram -- plan [--date YYYY-MM-DD]   plans a morning and sends it now
//   npm run telegram -- nudge          sends this morning's "no photo yet" nudge, if nothing's been reported
//   npm run telegram -- week           sends the weekly summary now
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { todayDayKey } from "../src/lib/dates";
import { env } from "../src/lib/env";
import type { TelegramUpdate } from "../src/lib/telegram";
import { configuredBotApi, sendEveningPlan, sendMorningNudge, sendWeeklySummary } from "../src/lib/walk-buddy";

async function main() {
  const api = configuredBotApi();
  if (!api) throw new Error("Set TELEGRAM_BOT_TOKEN (from @BotFather) first");
  const [command] = process.argv.slice(2);

  switch (command) {
    case "chats": {
      const updates = await api.call<TelegramUpdate[]>("getUpdates", {});
      const chats = new Map(updates.flatMap((u) => (u.message ? [[u.message.chat.id, u.message.from?.first_name ?? "?"]] : [])));
      if (chats.size === 0) console.log("No messages yet. Send the bot /start from your phone, then run this again.");
      for (const [id, name] of chats) console.log(`${id}  ${name}`);
      break;
    }
    case "set-webhook": {
      const secret = env.telegramWebhookSecret;
      if (!secret) throw new Error("Set TELEGRAM_WEBHOOK_SECRET first (letters, digits, _ and -; e.g. openssl rand -hex 32)");
      const url = `${env.siteUrl.replace(/\/$/, "")}/api/telegram`;
      if (!url.startsWith("https://")) throw new Error(`Telegram needs an https webhook; SITE_URL gives ${url}`);
      await api.call("setWebhook", {
        url,
        secret_token: secret,
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: true,
      });
      await api.call("setMyCommands", {
        commands: [
          { command: "plan", description: "Plan the next morning now" },
          { command: "spots", description: "Your spots, their timings, and what fits tomorrow" },
          { command: "schedule", description: "Your schedule rules, and tomorrow's" },
          { command: "week", description: "What I've learned this week" },
          { command: "help", description: "What I do" },
        ],
      });
      console.log(`Webhook set to ${url}`);
      break;
    }
    case "info":
      console.log(await api.call("getWebhookInfo", {}));
      break;
    case "plan": {
      const chatId = requireChat();
      const idx = process.argv.indexOf("--date");
      const date = idx >= 0 ? process.argv[idx + 1] : undefined;
      const usage = await sendEveningPlan({ api, client: new Anthropic(), chatId }, date);
      console.log(`Sent. input ${usage.inputTokens} + ${usage.cacheReadTokens} cache read; output ${usage.outputTokens}`);
      break;
    }
    case "nudge":
      console.log((await sendMorningNudge({ api, chatId: requireChat() }, todayDayKey(env.timezone))) ? "Sent." : "This morning is already reported.");
      break;
    case "week":
      await sendWeeklySummary({ api, chatId: requireChat() }, todayDayKey(env.timezone));
      console.log("Sent.");
      break;
    default:
      throw new Error("Usage: npm run telegram -- chats | set-webhook | info | plan [--date YYYY-MM-DD] | nudge | week");
  }
  process.exit(0);
}

function requireChat(): string {
  const chatId = env.telegramChatId;
  if (!chatId) throw new Error("Set TELEGRAM_CHAT_ID first (npm run telegram -- chats finds it)");
  return chatId;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
