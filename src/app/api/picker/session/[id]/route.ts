import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { getValidAccessToken } from "@/lib/owner";
import { getPickerSession } from "@/lib/google";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireOwner();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  try {
    const accessToken = await getValidAccessToken();
    const session = await getPickerSession(accessToken, id);
    return NextResponse.json({ ready: Boolean(session.mediaItemsSet) });
  } catch (err) {
    console.error("Failed to poll picker session", err);
    return NextResponse.json({ error: "Lost track of that picker session." }, { status: 500 });
  }
}
