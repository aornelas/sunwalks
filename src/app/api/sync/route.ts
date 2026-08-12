import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { getLatestSyncLog } from "@/lib/ingest";

// No POST here anymore — importing photos is a multi-step, user-present
// flow (create a picker session, wait for the owner to pick, then import),
// not a single fire-and-forget trigger. See /api/picker/session*.
export async function GET() {
  const unauthorized = await requireOwner();
  if (unauthorized) return unauthorized;
  const log = await getLatestSyncLog();
  return NextResponse.json({ log: log ?? null });
}
