import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { getValidAccessToken } from "@/lib/owner";
import { createPickerSession } from "@/lib/google";

// Google Duration strings look like "1.500s" — this project only needs the
// seconds value, not full ISO 8601 duration parsing.
function durationToMs(duration: string, fallbackMs: number): number {
  const match = /^([\d.]+)s$/.exec(duration);
  return match ? Math.round(Number(match[1]) * 1000) : fallbackMs;
}

export async function POST() {
  const unauthorized = await requireOwner();
  if (unauthorized) return unauthorized;

  try {
    const accessToken = await getValidAccessToken();
    const session = await createPickerSession(accessToken);
    return NextResponse.json({
      sessionId: session.id,
      pickerUri: session.pickerUri,
      pollIntervalMs: durationToMs(session.pollingConfig?.pollInterval ?? "2s", 2000),
      timeoutMs: durationToMs(session.pollingConfig?.timeoutIn ?? "300s", 300_000),
    });
  } catch (err) {
    console.error("Failed to create picker session", err);
    return NextResponse.json({ error: "Couldn't open Google Photos. Try again." }, { status: 500 });
  }
}
