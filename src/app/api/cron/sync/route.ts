import { NextRequest, NextResponse } from "next/server";
import { runSync } from "@/lib/ingest";
import { getOwnerAccount } from "@/lib/owner";
import { env } from "@/lib/env";

// Daily ingest. Vercel Cron calls this with an `Authorization: Bearer
// $CRON_SECRET` header (set CRON_SECRET the same in the project env and in
// vercel.json's cron config); anything else is rejected.
export async function GET(req: NextRequest) {
  const cronSecret = env.cronSecret;
  const auth = req.headers.get("authorization");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await getOwnerAccount();
  if (!account) {
    return NextResponse.json({ ok: true, skipped: "no owner connected" });
  }
  if (!account.autoSync) {
    return NextResponse.json({ ok: true, skipped: "auto-sync disabled" });
  }
  if (!account.albumId) {
    return NextResponse.json({ ok: true, skipped: "no album selected" });
  }

  try {
    const result = await runSync();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    );
  }
}
