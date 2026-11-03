import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { setMorningPlace } from "@/lib/places";

/** Sets where a morning was: on its photos without a place (and `photoId`, the one being edited) and in the walk log. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  const unauthorized = await requireOwner();
  if (unauthorized) return unauthorized;

  const { date } = await params;
  const { place, photoId } = await req.json().catch(() => ({}));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof place !== "string" || !place.trim()) {
    return NextResponse.json({ error: "A date and a place are required" }, { status: 400 });
  }
  try {
    await setMorningPlace(date, place, typeof photoId === "string" ? photoId : undefined);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to set the place" }, { status: 400 });
  }
}
