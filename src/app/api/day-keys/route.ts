import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { getAllCapturedDayKeys } from "@/lib/data";

export async function GET() {
  const unauthorized = await requireOwner();
  if (unauthorized) return unauthorized;
  const dayKeys = await getAllCapturedDayKeys();
  return NextResponse.json({ dayKeys });
}
