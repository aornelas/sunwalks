import { NextResponse } from "next/server";
import { isNull, desc } from "drizzle-orm";
import { db } from "@/db";
import { shareLinks } from "@/db/schema";
import { requireOwner } from "@/lib/require-owner";
import { randomToken } from "@/lib/crypto";
import { env } from "@/lib/env";

async function getActiveLink() {
  const [row] = await db
    .select()
    .from(shareLinks)
    .where(isNull(shareLinks.revokedAt))
    .orderBy(desc(shareLinks.createdAt))
    .limit(1);
  return row;
}

export async function GET() {
  const unauthorized = await requireOwner();
  if (unauthorized) return unauthorized;

  let link = await getActiveLink();
  if (!link) {
    [link] = await db.insert(shareLinks).values({ token: randomToken(6) }).returning();
  }
  return NextResponse.json({ url: `${env.siteUrl}/s/${link.token}` });
}

export async function POST() {
  const unauthorized = await requireOwner();
  if (unauthorized) return unauthorized;

  const existing = await getActiveLink();
  if (existing) {
    await db.update(shareLinks).set({ revokedAt: new Date() });
  }
  const [link] = await db.insert(shareLinks).values({ token: randomToken(6) }).returning();
  return NextResponse.json({ url: `${env.siteUrl}/s/${link.token}` });
}
