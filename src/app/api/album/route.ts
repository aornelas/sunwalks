import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { setAlbum } from "@/lib/owner";
import { runSync } from "@/lib/ingest";

export async function POST(req: NextRequest) {
  const unauthorized = await requireOwner();
  if (unauthorized) return unauthorized;

  const { albumId, albumName } = await req.json();
  if (!albumId || !albumName) {
    return NextResponse.json({ error: "albumId and albumName are required" }, { status: 400 });
  }

  await setAlbum(albumId, albumName);
  try {
    await runSync();
  } catch {
    // First sync failure shouldn't block onboarding — the calendar surfaces
    // sync status and a retry affordance.
  }
  return NextResponse.json({ ok: true });
}
