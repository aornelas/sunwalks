import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { importFromPickerSession } from "@/lib/ingest";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireOwner();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  try {
    const { photosAdded, touchedDays } = await importFromPickerSession(id);
    return NextResponse.json({ ok: true, photosAdded, touchedDays });
  } catch (err) {
    console.error("Failed to import picker session", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Import failed" },
      { status: 500 },
    );
  }
}
