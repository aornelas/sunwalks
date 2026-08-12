import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { runSync, getLatestSyncLog } from "@/lib/ingest";
import { getOwnerAccount } from "@/lib/owner";

export async function POST() {
  const unauthorized = await requireOwner();
  if (unauthorized) return unauthorized;

  try {
    const result = await runSync();
    const account = await getOwnerAccount();
    return NextResponse.json({ ok: true, ...result, syncedAt: account?.updatedAt });
  } catch (err) {
    console.error("Sync failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    );
  }
}

export async function GET() {
  const unauthorized = await requireOwner();
  if (unauthorized) return unauthorized;
  const log = await getLatestSyncLog();
  return NextResponse.json({ log: log ?? null });
}
