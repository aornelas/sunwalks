import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { getValidAccessToken } from "@/lib/owner";
import { listAlbums } from "@/lib/google";

export async function GET() {
  const unauthorized = await requireOwner();
  if (unauthorized) return unauthorized;

  try {
    const accessToken = await getValidAccessToken();
    const albums = await listAlbums(accessToken);
    return NextResponse.json({
      albums: albums.map((a) => ({
        id: a.id,
        title: a.title,
        photoCount: a.mediaItemsCount ? Number(a.mediaItemsCount) : 0,
        coverUrl: a.coverPhotoBaseUrl ? `${a.coverPhotoBaseUrl}=w168-h168-c` : null,
      })),
    });
  } catch (err) {
    console.error("Failed to list albums", err);
    return NextResponse.json({ error: "Couldn't load your Google Photos albums." }, { status: 500 });
  }
}
