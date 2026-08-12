import { NextResponse } from "next/server";
import { isAuthenticated } from "./session";
import { env } from "./env";

/** Returns a 401 response if the caller isn't the signed-in owner, else null. */
export async function requireOwner(): Promise<NextResponse | null> {
  if (env.demoMode) return null; // local preview only — see DEMO_MODE in .env.example
  const ok = await isAuthenticated();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}
