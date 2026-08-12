import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { computeStats } from "@/lib/stats";

export async function GET() {
  const unauthorized = await requireOwner();
  if (unauthorized) return unauthorized;
  const stats = await computeStats();
  return NextResponse.json({ stats });
}
