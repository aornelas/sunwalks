import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { placeOptions, reviewQueue } from "@/lib/places";

/** The places a morning can be, and the mornings whose photos still need one. */
export async function GET() {
  const unauthorized = await requireOwner();
  if (unauthorized) return unauthorized;
  const [options, queue] = await Promise.all([placeOptions(), reviewQueue()]);
  return NextResponse.json({ options, queue });
}
