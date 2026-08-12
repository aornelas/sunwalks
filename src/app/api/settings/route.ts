import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { setAutoSync } from "@/lib/owner";

export async function PATCH(req: NextRequest) {
  const unauthorized = await requireOwner();
  if (unauthorized) return unauthorized;

  const { autoSync } = await req.json();
  if (typeof autoSync !== "boolean") {
    return NextResponse.json({ error: "autoSync must be a boolean" }, { status: 400 });
  }
  await setAutoSync(autoSync);
  return NextResponse.json({ ok: true });
}
