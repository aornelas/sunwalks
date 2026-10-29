function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get googleClientId() {
    return required("GOOGLE_CLIENT_ID");
  },
  get googleClientSecret() {
    return required("GOOGLE_CLIENT_SECRET");
  },
  get appSecret() {
    return required("APP_SECRET");
  },
  get ownerEmail() {
    return process.env.OWNER_EMAIL; // optional: locks sign-in to this address
  },
  get timezone() {
    return process.env.APP_TIMEZONE || "America/Los_Angeles";
  },
  /** Owner's home coordinates — used only by the planning view's forecast/solar math. */
  get ownerLat() {
    return Number(process.env.OWNER_LAT) || 37.7749;
  },
  get ownerLon() {
    return Number(process.env.OWNER_LON) || -122.4194;
  },
  get siteUrl() {
    return process.env.SITE_URL || "http://localhost:3000";
  },
  /** Vercel sends it as a bearer token on cron invocations; unset means cron routes refuse every call. */
  get cronSecret() {
    return process.env.CRON_SECRET;
  },
  /** The walk buddy's bot, from @BotFather. Unset means the bot is off: the webhook refuses every call and the crons send nothing. */
  get telegramBotToken() {
    return process.env.TELEGRAM_BOT_TOKEN;
  },
  /** Given to setWebhook; Telegram echoes it in a header so the webhook can reject anything else. */
  get telegramWebhookSecret() {
    return process.env.TELEGRAM_WEBHOOK_SECRET;
  },
  /** The owner's own chat with the bot. Updates from any other chat are dropped. */
  get telegramChatId() {
    return process.env.TELEGRAM_CHAT_ID;
  },
  /** For tests and local runs against a fake Bot API. */
  get telegramApiBase() {
    return process.env.TELEGRAM_API_BASE || "https://api.telegram.org";
  },
  /** Serves seeded local images instead of calling Google — local dev/demo only. */
  get demoMode() {
    return process.env.DEMO_MODE === "true";
  },
};
