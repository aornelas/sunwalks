import { env } from "./env";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const PICKER_API = "https://photospicker.googleapis.com/v1";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

// `photoslibrary.readonly` (and albums.list/mediaItems.search) was removed
// by Google on 2025-03-31 — see design_handoff_sunrise_calendar/ANDROID_UPDATE.md
// discussion and https://developers.google.com/photos/support/updates. Broad,
// unattended library access is no longer available to apps; the Picker API
// below is the replacement, and it's inherently a user-present, one-shot
// selection flow — see src/lib/ingest.ts for what that means for this app.
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/photospicker.mediaitems.readonly",
].join(" ");

export function redirectUri(): string {
  return `${env.siteUrl}/api/auth/google/callback`;
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token?: string;
}

export async function exchangeCode(code: string): Promise<TokenSet> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri(),
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`);
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenSet> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${await res.text()}`);
  return res.json();
}

export interface GoogleUserInfo {
  sub: string;
  email: string;
}

export async function fetchUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Google userinfo failed: ${await res.text()}`);
  return res.json();
}

export interface PickerSession {
  id: string;
  pickerUri: string;
  pollingConfig: { pollInterval: string; timeoutIn: string };
  expireTime: string;
  mediaItemsSet?: boolean;
}

const MAX_ITEMS_PER_SESSION = "2000"; // Google's own max; int64 fields are strings in JSON

export async function createPickerSession(accessToken: string): Promise<PickerSession> {
  const res = await fetch(`${PICKER_API}/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ pickingConfig: { maxItemCount: MAX_ITEMS_PER_SESSION } }),
  });
  if (!res.ok) throw new Error(`Picker sessions.create failed: ${await res.text()}`);
  return res.json();
}

export async function getPickerSession(accessToken: string, sessionId: string): Promise<PickerSession> {
  const res = await fetch(`${PICKER_API}/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Picker sessions.get failed: ${await res.text()}`);
  return res.json();
}

export async function deletePickerSession(accessToken: string, sessionId: string): Promise<void> {
  await fetch(`${PICKER_API}/sessions/${sessionId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  }).catch(() => {}); // best-effort cleanup — a leaked session just expires on its own
}

export interface PickedMediaItem {
  id: string;
  createTime: string;
  type: "TYPE_UNSPECIFIED" | "PHOTO" | "VIDEO";
  mediaFile: {
    baseUrl: string;
    mimeType: string;
    filename: string;
    mediaFileMetadata?: {
      width?: number;
      height?: number;
    };
  };
}

export async function listPickerMediaItems(
  accessToken: string,
  sessionId: string,
  onPage: (items: PickedMediaItem[]) => Promise<void>,
): Promise<void> {
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ sessionId, pageSize: "100" });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(`${PICKER_API}/mediaItems?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Picker mediaItems.list failed: ${await res.text()}`);
    const data = await res.json();
    await onPage((data.mediaItems ?? []).filter((item: PickedMediaItem) => item.type === "PHOTO"));
    pageToken = data.nextPageToken;
  } while (pageToken);
}
