import type { DayData, Stats } from "./types";

export interface CalendarApi {
  fetchDays(start: string, end: string): Promise<DayData[]>;
  fetchStats(): Promise<Stats>;
  fetchDayKeys(): Promise<string[]>;
  setDayPhoto?(date: string, shotId: string): Promise<void>;
  triggerSync?(): Promise<{ ok: boolean; error?: string }>;
  setAutoSync?(autoSync: boolean): Promise<void>;
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
    async triggerSync() {
      const res = await fetch("/api/sync", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return { ok: false, error: body.error ?? "Sync failed" };
      }
      return { ok: true };
    },
    async setAutoSync(autoSync) {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoSync }),
      });
      await json(res);
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
