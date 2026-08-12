import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { photos } from "@/db/schema";
import { getValidAccessToken } from "@/lib/owner";
import { getMediaItem } from "@/lib/google";
import { env } from "@/lib/env";

// Public by design: the owner's share link renders these same <img> tags for
// family viewers, and Google's baseUrl (~60min TTL) must never be sent to
// the client directly — so every request re-resolves it here and streams
// the bytes through, letting the CDN cache the derivative long-term.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const size = req.nextUrl.searchParams.get("size") === "full" ? "full" : "sq";

  const [photo] = await db
    .select({ id: photos.id, filename: photos.filename })
    .from(photos)
    .where(eq(photos.id, id))
    .limit(1);
  if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (env.demoMode) {
    const url = new URL(`/seed-photos/${size}/${photo.filename}`, req.url);
    return NextResponse.redirect(url, { status: 302 });
  }

  try {
    const accessToken = await getValidAccessToken();
    const item = await getMediaItem(accessToken, id);
    const suffix = size === "full" ? "=w1200" : "=w400-h400-c";
    const imageRes = await fetch(`${item.baseUrl}${suffix}`);
    if (!imageRes.ok || !imageRes.body) {
      return NextResponse.json({ error: "Failed to fetch image" }, { status: 502 });
    }
    return new NextResponse(imageRes.body, {
      headers: {
        "Content-Type": imageRes.headers.get("Content-Type") ?? "image/jpeg",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (err) {
    console.error("Image proxy failed", err);
    return NextResponse.json({ error: "Image proxy failed" }, { status: 500 });
  }
}
