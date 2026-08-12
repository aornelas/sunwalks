import { NextResponse } from "next/server";
import { isShareTokenActive } from "@/lib/share";
import { getAllCapturedDayKeys } from "@/lib/data";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await isShareTokenActive(token))) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }
  const dayKeys = await getAllCapturedDayKeys();
  return NextResponse.json({ dayKeys });
}
