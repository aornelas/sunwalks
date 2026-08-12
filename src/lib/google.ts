import { env } from "./env";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const PHOTOS_API = "https://photoslibrary.googleapis.com/v1";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/photoslibrary.readonly",
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

export interface GoogleAlbum {
  id: string;
  title: string;
  mediaItemsCount?: string;
  coverPhotoBaseUrl?: string;
}

export async function listAlbums(accessToken: string): Promise<GoogleAlbum[]> {
  const albums: GoogleAlbum[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ pageSize: "50" });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(`${PHOTOS_API}/albums?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Google albums list failed: ${await res.text()}`);
    const data = await res.json();
    albums.push(...(data.albums ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return albums;
}

export interface GoogleMediaItem {
  id: string;
  filename: string;
  baseUrl: string;
  mimeType: string;
  mediaMetadata: {
    creationTime: string;
    width: string;
    height: string;
  };
}

export async function searchAlbumMediaItems(
  accessToken: string,
  albumId: string,
  onPage: (items: GoogleMediaItem[]) => Promise<void>,
): Promise<void> {
  let pageToken: string | undefined;
  do {
    const res = await fetch(`${PHOTOS_API}/mediaItems:search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ albumId, pageSize: 100, pageToken }),
    });
    if (!res.ok) throw new Error(`Google mediaItems:search failed: ${await res.text()}`);
    const data = await res.json();
    await onPage(data.mediaItems ?? []);
    pageToken = data.nextPageToken;
  } while (pageToken);
}

export async function getMediaItem(accessToken: string, id: string): Promise<GoogleMediaItem> {
  const res = await fetch(`${PHOTOS_API}/mediaItems/${id}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Google mediaItems.get failed: ${await res.text()}`);
  return res.json();
}
