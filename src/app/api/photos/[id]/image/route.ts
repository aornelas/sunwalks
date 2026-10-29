import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { photos } from "@/db/schema";
import { getPhotoSource } from "@/lib/photo-source";
import { env } from "@/lib/env";

// Public by design: the owner's share link renders these same <img> tags for
// family viewers. Bytes are downloaded once at import time (see ingest.ts)
// and served straight from local storage — there's no live Google call here
// anymore, since a Picker session's baseUrl is long gone by the time this
// gets requested.
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

  const bytes = await getPhotoSource().getImage(id, size);
  if (!bytes) return NextResponse.json({ error: "Image not stored" }, { status: 404 });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
