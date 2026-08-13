import type { DayData, PickerSessionInfo, Stats } from "./types";

export interface CalendarApi {
  fetchDays(start: string, end: string): Promise<DayData[]>;
  fetchStats(): Promise<Stats>;
  fetchDayKeys(): Promise<string[]>;
  setDayPhoto?(date: string, shotId: string): Promise<void>;
  createPickerSession?(): Promise<PickerSessionInfo>;
  pollPickerSession?(sessionId: string): Promise<{ ready: boolean }>;
  importPickerSession?(
    sessionId: string,
  ): Promise<{ ok: boolean; photosAdded?: number; touchedDays?: string[]; error?: string }>;
  getShareUrl?(): Promise<string>;
  regenerateShareUrl?(): Promise<string>;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export function createOwnerApi(): CalendarApi {
  return {
    async fetchDays(start, end) {
      const res = await fetch(`/api/days?start=${start}&end=${end}`);
      const data = await json<{ days: DayData[] }>(res);
      return data.days;
    },
    async fetchStats() {
      const res = await fetch("/api/stats");
      const data = await json<{ stats: Stats }>(res);
      return data.stats;
    },
    async fetchDayKeys() {
      const res = await fetch("/api/day-keys");
      const data = await json<{ dayKeys: string[] }>(res);
      return data.dayKeys;
    },
    async setDayPhoto(date, shotId) {
      const res = await fetch(`/api/day/${date}/day-photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shotId }),
      });
      await json(res);
    },
    async createPickerSession() {
      const res = await fetch("/api/picker/session", { method: "POST" });
      return json<PickerSessionInfo>(res);
    },
    async pollPickerSession(sessionId) {
      const res = await fetch(`/api/picker/session/${sessionId}`);
      return json<{ ready: boolean }>(res);
    },
    async importPickerSession(sessionId) {
      const res = await fetch(`/api/picker/session/${sessionId}/import`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error ?? "Import failed" };
      return { ok: true, photosAdded: data.photosAdded, touchedDays: data.touchedDays };
    },
    async getShareUrl() {
      const res = await fetch("/api/share-links");
      const data = await json<{ url: string }>(res);
      return data.url;
    },
    async regenerateShareUrl() {
      const res = await fetch("/api/share-links", { method: "POST" });
      const data = await json<{ url: string }>(res);
      return data.url;
    },
  };
}

export function createShareApi(token: string): CalendarApi {
  return {
    async fetchDays(start, end) {
      const res = await fetch(`/api/s/${token}/days?start=${start}&end=${end}`);
      const data = await json<{ days: DayData[] }>(res);
      return data.days;
    },
    async fetchStats() {
      const res = await fetch(`/api/s/${token}/stats`);
      const data = await json<{ stats: Stats }>(res);
      return data.stats;
    },
    async fetchDayKeys() {
      const res = await fetch(`/api/s/${token}/day-keys`);
      const data = await json<{ dayKeys: string[] }>(res);
      return data.dayKeys;
    },
  };
}
