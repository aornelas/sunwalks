import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { refreshForecast } from "@/lib/planning";

// Nightly (see vercel.json): stores tomorrow's forecast as it stands in the
// evening, so forecast_snapshots holds the evening-before prediction for
// every morning, not only the ones when the app happened to be opened.
export async function GET(req: NextRequest) {
  const secret = env.cronSecret;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await refreshForecast();
  return NextResponse.json(result);
}
