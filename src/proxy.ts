import { NextRequest, NextResponse } from "next/server";

// Kept as a literal (not imported from lib/session) so this file has zero
// Node-only dependencies — middleware runs on the Edge runtime.
const SESSION_COOKIE = "sunrise_session";

const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth",
  "/api/cron/", // authenticated by CRON_SECRET in the route itself
  "/s/",
  "/api/s/",
  "/api/photos/",
  "/seed-photos/",
  "/manifest.json",
  "/icons",
  "/favicon.ico",
];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/s/")) {
    const res = NextResponse.next();
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
  }
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next();
  }
  if (process.env.DEMO_MODE === "true") return NextResponse.next();
  // Presence check only — routes/API handlers re-validate the session
  // against the database before trusting it for any read or write.
  const hasCookie = req.cookies.has(SESSION_COOKIE);
  if (!hasCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
