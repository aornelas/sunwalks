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
  get siteUrl() {
    return process.env.SITE_URL || "http://localhost:3000";
  },
  /** Serves seeded local images instead of calling Google — local dev/demo only. */
  get demoMode() {
    return process.env.DEMO_MODE === "true";
  },
};
