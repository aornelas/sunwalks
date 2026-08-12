import { NextResponse } from "next/server";
import { isShareTokenActive } from "@/lib/share";
import { computeStats } from "@/lib/stats";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await isShareTokenActive(token))) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }
  const stats = await computeStats();
  return NextResponse.json({ stats });
}
