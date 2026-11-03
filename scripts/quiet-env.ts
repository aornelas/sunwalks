// Loads .env.local, then .env, without dotenv's banner, which would land on
// stdout. Imported first by scripts whose stdout is a protocol channel
// (scripts/mcp.ts). .env.local wins, as it does for the Next.js app, so the
// MCP server reads the same database the app does.
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
