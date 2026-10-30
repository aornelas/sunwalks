// A small client for the Telegram Bot API: only the methods and fields the
// walk buddy uses (see walk-buddy.ts). Every call is a POST of JSON to
// https://api.telegram.org/bot<token>/<method>, answered with
// { ok, result } or { ok: false, description }.

import { timingSafeEqual } from "node:crypto";

export interface TelegramUser {
  id: number;
  first_name: string;
}

export interface TelegramChat {
  id: number;
  type: string;
}

export interface PhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

/** A file sent as a file rather than a photo: the original bytes, metadata and all. */
export interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramMessage {
  message_id: number;
  /** Unix seconds. */
  date: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
  caption?: string;
  photo?: PhotoSize[];
  document?: TelegramDocument;
  /** Shared by the photos of one album, which arrive as separate messages. */
  media_group_id?: string;
  /** The message this one answers, when the owner used Reply. */
  reply_to_message?: TelegramMessage;
}

export interface CallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: CallbackQuery;
}

export interface InlineButton {
  text: string;
  /** 1–64 bytes, handed back in the callback query when the button is tapped. */
  callback_data: string;
}

export interface InlineKeyboard {
  inline_keyboard: InlineButton[][];
}

export interface TelegramApi {
  call<T = unknown>(method: string, params: Record<string, unknown>): Promise<T>;
  /** Downloads a file by the file_path getFile returned (files up to 20 MB). */
  download(filePath: string): Promise<Buffer>;
}

export class TelegramError extends Error {}

export function telegramApi(
  token: string,
  options: { base?: string; fetch?: typeof fetch } = {},
): TelegramApi {
  const base = (options.base ?? "https://api.telegram.org").replace(/\/$/, "");
  const doFetch = options.fetch ?? fetch;
  return {
    async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
      const res = await doFetch(`${base}/bot${token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      const body = (await res.json().catch(() => null)) as { ok: boolean; result?: T; description?: string } | null;
      if (!body?.ok) throw new TelegramError(`${method} failed: ${body?.description ?? `HTTP ${res.status}`}`);
      return body.result as T;
    },
    async download(filePath: string): Promise<Buffer> {
      const res = await doFetch(`${base}/file/bot${token}/${filePath}`);
      if (!res.ok) throw new TelegramError(`Download failed: HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    },
  };
}

/**
 * Telegram sends the secret given to setWebhook in this header on every
 * webhook request. Anything without it didn't come from Telegram.
 */
export const SECRET_HEADER = "x-telegram-bot-api-secret-token";

export function secretMatches(received: string | null, expected: string): boolean {
  if (!received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The chat an update came from, or null for update types the bot doesn't handle. */
export function chatOf(update: TelegramUpdate): number | null {
  return update.message?.chat.id ?? update.callback_query?.message?.chat.id ?? null;
}

/** True only for updates from the owner's own chat; everything else is dropped unread. */
export function isFromOwner(update: TelegramUpdate, ownerChatId: string): boolean {
  const chat = chatOf(update);
  return chat != null && String(chat) === ownerChatId;
}

/** The biggest version of a photo Telegram stored (it sends several sizes, smallest first). */
export function largestPhoto(sizes: PhotoSize[]): PhotoSize {
  return sizes.reduce((best, s) => (s.width * s.height > best.width * best.height ? s : best));
}

/**
 * The image in a message, if there is one: a photo (compressed by Telegram,
 * metadata stripped) or an image sent as a file (the original, with the
 * time it was taken).
 */
export function imageOf(message: TelegramMessage): { fileId: string; uniqueId: string; original: boolean } | null {
  if (message.photo?.length) {
    const p = largestPhoto(message.photo);
    return { fileId: p.file_id, uniqueId: p.file_unique_id, original: false };
  }
  const doc = message.document;
  if (doc && (doc.mime_type?.startsWith("image/") || /\.(jpe?g|png|heic|webp)$/i.test(doc.file_name ?? ""))) {
    return { fileId: doc.file_id, uniqueId: doc.file_unique_id, original: true };
  }
  return null;
}

// What a button tap carries. Kept short: callback_data is capped at 64 bytes.
//   w:2026-10-30:3   was at spot 3 that morning
//   s:2026-10-30     was at home
//   z:2026-10-30     slept in
//   r:2026-10-30:4   rated the morning 4 of 5
export type ButtonAction =
  | { kind: "walk"; date: string; spotId: number }
  | { kind: "stay"; date: string }
  | { kind: "slept"; date: string }
  | { kind: "rate"; date: string; rating: number };

export function encodeButton(action: ButtonAction): string {
  switch (action.kind) {
    case "walk":
      return `w:${action.date}:${action.spotId}`;
    case "stay":
      return `s:${action.date}`;
    case "slept":
      return `z:${action.date}`;
    case "rate":
      return `r:${action.date}:${action.rating}`;
  }
}

export function decodeButton(data: string | undefined): ButtonAction | null {
  const m = /^([wszr]):(\d{4}-\d{2}-\d{2})(?::(\d+))?$/.exec(data ?? "");
  if (!m) return null;
  const [, kind, date, n] = m;
  if (kind === "s") return n == null ? { kind: "stay", date } : null;
  if (kind === "z") return n == null ? { kind: "slept", date } : null;
  if (n == null) return null;
  if (kind === "w") return { kind: "walk", date, spotId: Number(n) };
  const rating = Number(n);
  return rating >= 1 && rating <= 5 ? { kind: "rate", date, rating } : null;
}
