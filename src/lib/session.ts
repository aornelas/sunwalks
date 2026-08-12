import { cookies } from "next/headers";
import { eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { randomToken } from "./crypto";

export const SESSION_COOKIE = "sunrise_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export async function createSession(): Promise<string> {
  const token = randomToken(24);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ token, expiresAt });
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  return token;
}

export async function destroySession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.token, token));
}

export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  const [row] = await db.select().from(sessions).where(eq(sessions.token, token)).limit(1);
  if (!row) return false;
  return row.expiresAt.getTime() > Date.now();
}
