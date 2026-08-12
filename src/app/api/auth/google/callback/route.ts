import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, fetchUserInfo } from "@/lib/google";
import { getOwnerAccount, upsertOwnerAccount } from "@/lib/owner";
import { createSession, SESSION_COOKIE } from "@/lib/session";
import { env } from "@/lib/env";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = req.cookies.get("oauth_state")?.value;
  const error = url.searchParams.get("error");

  const fail = (message: string) =>
    NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, req.url));

  if (error) return fail(error);
  if (!code || !state || !expectedState || state !== expectedState) {
    return fail("Invalid OAuth state");
  }

  try {
    const tokenSet = await exchangeCode(code);
    if (!tokenSet.refresh_token) {
      // Google only returns a refresh token on the first consent, or if
      // prompt=consent forces re-consent (which login/route.ts always sets).
      return fail("Google did not return a refresh token — try again");
    }
    const userInfo = await fetchUserInfo(tokenSet.access_token);

    const existing = await getOwnerAccount();
    const ownerEmail = env.ownerEmail;
    if (ownerEmail && userInfo.email !== ownerEmail) {
      return fail("This app is locked to a different Google account");
    }
    if (existing && existing.googleSub !== userInfo.sub) {
      return fail("This app is already connected to a different Google account");
    }

    await upsertOwnerAccount({
      email: userInfo.email,
      googleSub: userInfo.sub,
      refreshToken: tokenSet.refresh_token,
    });

    const sessionToken = await createSession();
    const account = await getOwnerAccount();
    const destination = account?.albumId ? "/" : "/onboarding";

    const res = NextResponse.redirect(new URL(destination, req.url));
    res.cookies.set(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
    res.cookies.delete("oauth_state");
    return res;
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Sign-in failed");
  }
}
