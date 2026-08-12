"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { useLandscapePhoto } from "@/hooks/useLandscapePhoto";
import { useCalendarData } from "@/hooks/useCalendarData";
import { createOwnerApi, createShareApi } from "@/lib/api-client";
import { monthKey as toMonthKey, monthName } from "@/lib/dates";
import type { AccountInfo, DayData, Stats, SyncInfo, ZoomLevel } from "@/lib/types";
import { MobileShell } from "./MobileShell";
import { WebShell } from "./WebShell";
import { PhotoView } from "./PhotoView";
import { WebPhotoView } from "./WebPhotoView";
import { LandscapePhotoView } from "./LandscapePhotoView";
import { SettingsSheet } from "./SettingsSheet";

interface DetailState {
  date: string;
  shotIndex: number;
}

export interface CalendarAppProps {
  readOnly: boolean;
  shareToken?: string;
  timezone: string;
  today: string;
  initialDays: DayData[];
  initialStats: Stats;
  initialDayKeys: string[];
  account?: AccountInfo;
  syncInfo?: SyncInfo;
}

export function CalendarApp({
  readOnly,
  shareToken,
  timezone,
  today,
  initialDays,
  initialStats,
  initialDayKeys,
  account,
  syncInfo,
}: CalendarAppProps) {
  const api = useMemo(
    () => (readOnly && shareToken ? createShareApi(shareToken) : createOwnerApi()),
    [readOnly, shareToken],
  );
  const calendarData = useCalendarData(api, initialDays, initialStats);

  const [dayKeys, setDayKeys] = useState(initialDayKeys);
  const [zoom, setZoom] = useState<ZoomLevel>("month");
  const [filter, setFilter] = useState(false);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [jumpMonth, setJumpMonth] = useState<{ month: string; nonce: number } | undefined>();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [accountState, setAccountState] = useState(account);
  const [syncInfoState, setSyncInfoState] = useState<SyncInfo | undefined>(syncInfo);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const isDesktop = useIsDesktop();
  const isLandscape = useLandscapePhoto();

  useEffect(() => {
    document.body.style.overflow = detail || sheetOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [detail, sheetOpen]);

  useEffect(() => {
    // The calendar itself is portrait-locked; only the photo view route
    // responds to a physical rotation. Only works in installed-PWA-like
    // contexts that grant orientation lock — a silent no-op elsewhere.
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    orientation?.lock?.("portrait").catch(() => {});
  }, []);

  const openDetailFor = useCallback(
    async (date: string, shotIndex?: number) => {
      if (!calendarData.getDay(date)) {
        await calendarData.ensureLoaded(date, date);
      }
      const day = calendarData.getDay(date);
      if (!day || day.shots.length === 0) return;
      const defaultIdx = day.shots.findIndex((s) => s.id === day.dayShotId);
      setDetail({ date, shotIndex: shotIndex ?? Math.max(0, defaultIdx) });
    },
    [calendarData],
  );

  const closeDetail = useCallback(() => setDetail(null), []);

  const changeShotIndex = useCallback((index: number) => {
    setDetail((prev) => (prev ? { ...prev, shotIndex: index } : prev));
  }, []);

  const handleSetDayPhoto = useCallback(
    async (shotId: string) => {
      if (!detail || !api.setDayPhoto) return;
      await api.setDayPhoto(detail.date, shotId);
      calendarData.applyDayPhoto(detail.date, shotId);
    },
    [api, calendarData, detail],
  );

  const handleJumpToMonth = useCallback((mKey: string) => {
    setZoom("month");
    setJumpMonth({ month: mKey, nonce: Date.now() });
  }, []);

  const fetchShareUrl = useCallback(async () => {
    if (!api.getShareUrl) return null;
    const url = await api.getShareUrl();
    setShareUrl(url);
    return url;
  }, [api]);

  const handleShare = useCallback(async () => {
    const url = readOnly ? window.location.href : (shareUrl ?? (await fetchShareUrl()) ?? window.location.href);
    if (navigator.share) {
      try {
        await navigator.share({ title: "Sunrise", url });
        return;
      } catch {
        // fall through to clipboard
      }
    }
    await navigator.clipboard.writeText(url).catch(() => {});
  }, [readOnly, shareUrl, fetchShareUrl]);

  const handleOpenSettings = useCallback(() => {
    setSheetOpen(true);
    if (!shareUrl) fetchShareUrl();
  }, [shareUrl, fetchShareUrl]);

  const runSync = useCallback(async () => {
    if (!api.triggerSync) return;
    setSyncing(true);
    const result = await api.triggerSync();
    setSyncInfoState({
      lastSyncedAt: result.ok ? new Date().toISOString() : (syncInfoState?.lastSyncedAt ?? null),
      status: result.ok ? "ok" : "error",
      error: result.error,
    });
    if (result.ok) {
      await calendarData.refreshStats();
      if (api.fetchDayKeys) setDayKeys(await api.fetchDayKeys());
    }
    setSyncing(false);
  }, [api, calendarData, syncInfoState]);

  const handleToggleAutoSync = useCallback(
    async (value: boolean) => {
      setAccountState((prev) => (prev ? { ...prev, autoSync: value } : prev));
      await api.setAutoSync?.(value);
    },
    [api],
  );

  const handleCopyLink = useCallback(async () => {
    const url = shareUrl ?? (await fetchShareUrl());
    if (url) await navigator.clipboard.writeText(url).catch(() => {});
  }, [shareUrl, fetchShareUrl]);

  const firstMonthLabel = dayKeys.length > 0 ? monthName(toMonthKey(dayKeys[0])) : null;

  const detailDay = detail ? calendarData.getDay(detail.date) : undefined;

  const shellProps = {
    today,
    timezone,
    readOnly,
    zoom,
    onZoomChange: setZoom,
    filter,
    onFilterChange: setFilter,
    stats: calendarData.stats,
    getDay: calendarData.getDay,
    ensureLoaded: calendarData.ensureLoaded,
    onOpenDay: openDetailFor,
    onJumpToMonth: handleJumpToMonth,
    jumpMonth: jumpMonth?.month,
  };

  return (
    <>
      {isDesktop ? (
        <WebShell
          {...shellProps}
          firstMonthLabel={firstMonthLabel}
          account={accountState}
          syncInfo={syncInfoState}
          shareUrl={shareUrl}
          syncing={syncing}
          onFetchNow={runSync}
          onCopyShareLink={handleCopyLink}
        />
      ) : (
        <MobileShell
          {...shellProps}
          syncing={syncing}
          onRefresh={runSync}
          onOpenSettings={handleOpenSettings}
        />
      )}

      {detail && detailDay && (
        isDesktop ? (
          <WebPhotoView
            date={detail.date}
            shotIndex={detail.shotIndex}
            day={detailDay}
            timezone={timezone}
            dayKeys={dayKeys}
            readOnly={readOnly}
            onClose={closeDetail}
            onNavigate={(d) => openDetailFor(d)}
            onChangeShotIndex={changeShotIndex}
            onSetDayPhoto={handleSetDayPhoto}
            onShare={handleShare}
          />
        ) : isLandscape ? (
          <LandscapePhotoView
            date={detail.date}
            shotIndex={detail.shotIndex}
            day={detailDay}
            timezone={timezone}
            dayKeys={dayKeys}
            readOnly={readOnly}
            onClose={closeDetail}
            onNavigate={(d) => openDetailFor(d)}
            onChangeShotIndex={changeShotIndex}
            onSetDayPhoto={handleSetDayPhoto}
            onShare={handleShare}
          />
        ) : (
          <PhotoView
            date={detail.date}
            shotIndex={detail.shotIndex}
            day={detailDay}
            timezone={timezone}
            dayKeys={dayKeys}
            readOnly={readOnly}
            onClose={closeDetail}
            onNavigate={(d) => openDetailFor(d)}
            onChangeShotIndex={changeShotIndex}
            onSetDayPhoto={handleSetDayPhoto}
            onShare={handleShare}
          />
        )
      )}

      {sheetOpen && !readOnly && accountState && (
        <SettingsSheet
          account={accountState}
          syncInfo={syncInfoState ?? { lastSyncedAt: null, status: "never" }}
          timezone={timezone}
          shareUrl={shareUrl}
          syncing={syncing}
          onClose={() => setSheetOpen(false)}
          onToggleAutoSync={handleToggleAutoSync}
          onFetchNow={runSync}
          onCopyLink={handleCopyLink}
          onChangeAccount={() => {
            window.location.href = "/api/auth/google/login";
          }}
          onSwitchAlbum={() => {
            window.location.href = "/onboarding";
          }}
        />
      )}
    </>
  );
}
