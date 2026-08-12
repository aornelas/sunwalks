import { NextResponse } from "next/server";
import { buildAuthUrl } from "@/lib/google";
import { randomToken } from "@/lib/crypto";

export async function GET() {
  const state = randomToken(16);
  const res = NextResponse.redirect(buildAuthUrl(state));
  res.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
