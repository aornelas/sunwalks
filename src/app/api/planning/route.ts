import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { getPlanningResponse } from "@/lib/planning";

export async function GET(req: NextRequest) {
  const unauthorized = await requireOwner();
  if (unauthorized) return unauthorized;

  const start = req.nextUrl.searchParams.get("start") ?? undefined;
  const planning = await getPlanningResponse(start);
  return NextResponse.json(planning);
}
