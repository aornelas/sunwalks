import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { setDayPhoto } from "@/lib/data";

export async function POST(req: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  const unauthorized = await requireOwner();
  if (unauthorized) return unauthorized;

  const { date } = await params;
  const { shotId } = await req.json();
  if (!shotId) return NextResponse.json({ error: "shotId is required" }, { status: 400 });

  try {
    await setDayPhoto(date, shotId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to set day photo" },
      { status: 400 },
    );
  }
}
