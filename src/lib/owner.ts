import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ownerAccount } from "@/db/schema";
import { decrypt, encrypt } from "./crypto";
import { refreshAccessToken } from "./google";

export type OwnerAccount = typeof ownerAccount.$inferSelect;

// Access tokens live ~1hr; cache in memory per server instance rather than
// hitting Google (and rewriting the DB) on every request. Cleared whenever
// the stored refresh token changes (see upsertOwnerAccount) so a re-auth
// (e.g. after granting a new scope) can't keep serving a stale token.
let cachedAccessToken: { token: string; expiresAt: number } | undefined;

export async function getOwnerAccount(): Promise<OwnerAccount | undefined> {
  const [row] = await db.select().from(ownerAccount).where(eq(ownerAccount.id, 1)).limit(1);
  return row;
}

export async function upsertOwnerAccount(fields: {
  email: string;
  googleSub: string;
  refreshToken: string;
}): Promise<void> {
  const existing = await getOwnerAccount();
  const refreshTokenEncrypted = encrypt(fields.refreshToken);
  if (existing) {
    await db
      .update(ownerAccount)
      .set({
        email: fields.email,
        googleSub: fields.googleSub,
        refreshTokenEncrypted,
        updatedAt: new Date(),
      })
      .where(eq(ownerAccount.id, 1));
  } else {
    await db.insert(ownerAccount).values({
      id: 1,
      email: fields.email,
      googleSub: fields.googleSub,
      refreshTokenEncrypted,
    });
  }
  // The old access token (possibly missing scopes granted just now, or
  // belonging to a since-replaced refresh token) is no longer valid to reuse.
  cachedAccessToken = undefined;
}

export async function markPicked(): Promise<void> {
  await db
    .update(ownerAccount)
    .set({ lastPickedAt: new Date(), updatedAt: new Date() })
    .where(eq(ownerAccount.id, 1));
}

export async function getValidAccessToken(): Promise<string> {
  const account = await getOwnerAccount();
  if (!account) throw new Error("No owner account connected");

  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 30_000) {
    return cachedAccessToken.token;
  }

  const refreshToken = decrypt(account.refreshTokenEncrypted);
  const tokenSet = await refreshAccessToken(refreshToken);
  cachedAccessToken = {
    token: tokenSet.access_token,
    expiresAt: Date.now() + tokenSet.expires_in * 1000,
  };
  return cachedAccessToken.token;
}
