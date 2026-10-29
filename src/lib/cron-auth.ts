import type { NextRequest } from "next/server";
import { env } from "./env";

/** Vercel sends CRON_SECRET as a bearer token on cron invocations; unset refuses every call. */
export function isCronRequest(req: NextRequest): boolean {
  const secret = env.cronSecret;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}
