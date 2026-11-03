import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { SPOT_KINDS as KINDS } from "@/lib/place-scores";
import { addSpot } from "@/lib/spots";

/** Adds a spot, for a morning somewhere new. Timings are set from the walk buddy or the CLI. */
export async function POST(req: NextRequest) {
  const unauthorized = await requireOwner();
  if (unauthorized) return unauthorized;

  const { name, kind } = await req.json().catch(() => ({}));
  if (typeof name !== "string" || !KINDS.includes(kind)) {
    return NextResponse.json({ error: `A name and a kind (${KINDS.join(", ")}) are required` }, { status: 400 });
  }
  try {
    const spot = await addSpot(name, kind);
    return NextResponse.json({ name: spot.name });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to add the spot" }, { status: 400 });
  }
}
