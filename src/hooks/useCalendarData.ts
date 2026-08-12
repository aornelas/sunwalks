"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { CalendarApi } from "@/lib/api-client";
import type { DayData, Stats } from "@/lib/types";

export interface CalendarData {
  daysByDate: Map<string, DayData>;
  getDay(date: string): DayData | undefined;
  ensureLoaded(start: string, end: string): Promise<void>;
  isLoading(start: string, end: string): boolean;
  stats: Stats;
  refreshStats(): Promise<void>;
  applyDayPhoto(date: string, shotId: string): void;
}

export function useCalendarData(api: CalendarApi, initialDays: DayData[], initialStats: Stats): CalendarData {
  const [daysByDate, setDaysByDate] = useState<Map<string, DayData>>(
    () => new Map(initialDays.map((d) => [d.date, d])),
  );
  const [stats, setStats] = useState<Stats>(initialStats);
  const loadedRanges = useRef<Set<string>>(new Set());
  const [, forceRender] = useState(0);

  const ensureLoaded = useCallback(
    async (start: string, end: string) => {
      const key = `${start}:${end}`;
      if (loadedRanges.current.has(key)) return;
      loadedRanges.current.add(key);
      forceRender((n) => n + 1);
      try {
        const fresh = await api.fetchDays(start, end);
        setDaysByDate((prev) => {
          const next = new Map(prev);
          for (const d of fresh) next.set(d.date, d);
          return next;
        });
      } catch {
        loadedRanges.current.delete(key); // allow retry
      }
    },
    [api],
  );

  const isLoading = useCallback((start: string, end: string) => {
    return loadedRanges.current.has(`${start}:${end}`) === false;
  }, []);

  const getDay = useCallback((date: string) => daysByDate.get(date), [daysByDate]);

  const refreshStats = useCallback(async () => {
    const fresh = await api.fetchStats();
    setStats(fresh);
  }, [api]);

  const applyDayPhoto = useCallback((date: string, shotId: string) => {
    setDaysByDate((prev) => {
      const day = prev.get(date);
      if (!day) return prev;
      const next = new Map(prev);
      next.set(date, { ...day, dayShotId: shotId });
      return next;
    });
  }, []);

  return useMemo(
    () => ({ daysByDate, getDay, ensureLoaded, isLoading, stats, refreshStats, applyDayPhoto }),
    [daysByDate, getDay, ensureLoaded, isLoading, stats, refreshStats, applyDayPhoto],
  );
}
