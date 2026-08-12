import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ownerAccount } from "@/db/schema";
import { decrypt, encrypt } from "./crypto";
import { refreshAccessToken } from "./google";

export type OwnerAccount = typeof ownerAccount.$inferSelect;

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
}

export async function setAlbum(albumId: string, albumName: string): Promise<void> {
  await db
    .update(ownerAccount)
    .set({ albumId, albumName, updatedAt: new Date() })
    .where(eq(ownerAccount.id, 1));
}

export async function setAutoSync(autoSync: boolean): Promise<void> {
  await db.update(ownerAccount).set({ autoSync, updatedAt: new Date() }).where(eq(ownerAccount.id, 1));
}

// Access tokens live ~1hr; cache in memory per server instance rather than
// hitting Google (and rewriting the DB) on every request.
let cachedAccessToken: { token: string; expiresAt: number } | undefined;

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
