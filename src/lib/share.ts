import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { shareLinks } from "@/db/schema";

export async function isShareTokenActive(token: string): Promise<boolean> {
  const [row] = await db
    .select({ token: shareLinks.token })
    .from(shareLinks)
    .where(and(eq(shareLinks.token, token), isNull(shareLinks.revokedAt)))
    .limit(1);
  return Boolean(row);
}
