import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { getDaysInRange } from "@/lib/data";

export async function GET(req: NextRequest) {
  const unauthorized = await requireOwner();
  if (unauthorized) return unauthorized;

  const start = req.nextUrl.searchParams.get("start");
  const end = req.nextUrl.searchParams.get("end");
  if (!start || !end) {
    return NextResponse.json({ error: "start and end are required" }, { status: 400 });
  }
  const data = await getDaysInRange(start, end);
  return NextResponse.json({ days: data });
}
