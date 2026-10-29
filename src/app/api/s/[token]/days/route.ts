import { NextRequest, NextResponse } from "next/server";
import { isShareTokenActive } from "@/lib/share";
import { getDaysInRange } from "@/lib/data";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await isShareTokenActive(token))) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }
  const start = req.nextUrl.searchParams.get("start");
  const end = req.nextUrl.searchParams.get("end");
  if (!start || !end) {
    return NextResponse.json({ error: "start and end are required" }, { status: 400 });
  }
  const data = await getDaysInRange(start, end, { includePlace: false });
  return NextResponse.json({ days: data });
}
