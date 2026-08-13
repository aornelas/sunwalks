"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { useLandscapePhoto } from "@/hooks/useLandscapePhoto";
import { useCalendarData } from "@/hooks/useCalendarData";
import { usePickerImport } from "@/hooks/usePickerImport";
import { createOwnerApi, createShareApi } from "@/lib/api-client";
import type { AccountInfo, DayData, Stats, ZoomLevel } from "@/lib/types";
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
}: CalendarAppProps) {
  const api = useMemo(
    () => (readOnly && shareToken ? createShareApi(shareToken) : createOwnerApi()),
    [readOnly, shareToken],
  );
  const calendarData = useCalendarData(api, initialDays, initialStats);
  const pickerImport = usePickerImport(api);

  // Neither needs to be mutable client state: a picker import triggers a
  // full reload (see below), and a fresh server render is what updates them.
  const dayKeys = initialDayKeys;
  const accountState = account;

  // Month + (for a shared, read-only viewer) sunrise-days-only is the
  // sensible first impression; a returning visitor's actual choice then
  // overrides this once the cookie-read effect below runs.
  const [zoom, setZoom] = useState<ZoomLevel>("month");
  const [filter, setFilter] = useState(readOnly);
  const [prefsReady, setPrefsReady] = useState(false);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [jumpMonth, setJumpMonth] = useState<{ month: string; nonce: number } | undefined>();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  // Remembers the visitor's own zoom/filter choice across visits (a browser
  // cookie, not localStorage) — read once on mount, then kept in sync
  // thereafter. Gated on prefsReady (state, not a ref) so the write effects
  // below only fire once this initial read has already applied any saved
  // value — otherwise they'd race it and briefly write the pre-cookie
  // default back over a real saved preference.
  useEffect(() => {
    const cookies = document.cookie;
    const savedZoom = cookies.match(/(?:^|; )sc_zoom=([^;]+)/)?.[1];
    const savedFilter = cookies.match(/(?:^|; )sc_filter=([^;]+)/)?.[1];
    // Legitimate one-time sync from a cookie the page loaded with, not a
    // derived-state loop — see https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (savedZoom === "week" || savedZoom === "month" || savedZoom === "year") setZoom(savedZoom);
    if (savedFilter) setFilter(savedFilter === "1");
    setPrefsReady(true);
  }, []);

  useEffect(() => {
    if (!prefsReady) return;
    document.cookie = `sc_zoom=${zoom}; path=/; max-age=31536000; samesite=lax`;
  }, [zoom, prefsReady]);

  useEffect(() => {
    if (!prefsReady) return;
    document.cookie = `sc_filter=${filter ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  }, [filter, prefsReady]);

  // Once a picker import finishes, newly-added days need to show up
  // everywhere: the grid cache, stats, the prev/next day-key list, the "last
  // added" line. The grid cache is keyed by already-fetched date ranges, so
  // rather than guess which ranges need invalidating, show the "Added N
  // photos" confirmation briefly and then do a full reload — imports are a
  // deliberate, infrequent action, not a hot path worth hand-patching.
  useEffect(() => {
    if (pickerImport.state !== "done") return;
    const id = window.setTimeout(() => window.location.reload(), 1400);
    return () => window.clearTimeout(id);
  }, [pickerImport.state]);

  const isDesktop = useIsDesktop();
  const isLandscape = useLandscapePhoto();

  // Tracks which overlay currently owns the top history entry we pushed, so
  // the popstate handler knows what to close and our own close buttons know
  // whether to walk history back (see ANDROID_UPDATE.md §3).
  const historyOwnerRef = useRef<"detail" | "sheet" | null>(null);

  useEffect(() => {
    document.body.style.overflow = detail || sheetOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [detail, sheetOpen]);

  useEffect(() => {
    // The calendar itself is portrait-locked at runtime (manifest.json
    // deliberately declares no static orientation — see the comment there);
    // only the photo view unlocks rotation while it's open. Both calls
    // reject when not installed/fullscreen — that's expected and silently
    // ignored.
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (o: string) => Promise<void>;
      unlock?: () => void;
    };
    if (detail) {
      try {
        orientation?.unlock?.();
      } catch {
        // not supported in this context
      }
    } else {
      orientation?.lock?.("portrait").catch(() => {});
    }
  }, [detail]);

  useEffect(() => {
    // The photo view is a near-black overlay; without this the Android
    // status bar (and installed app's task-switcher chrome) stays the
    // app's light theme color and reads as a pale bar floating over dark
    // content. #17140f matches --photo-ground exactly.
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", detail ? "#17140f" : "#f5ead8");
  }, [detail]);

  const openDetailFor = useCallback(
    async (date: string, shotIndex?: number, historyMode: "push" | "replace" = "push") => {
      if (!calendarData.getDay(date)) {
        await calendarData.ensureLoaded(date, date);
      }
      const day = calendarData.getDay(date);
      if (!day || day.shots.length === 0) return;
      const defaultIdx = day.shots.findIndex((s) => s.id === day.dayShotId);
      setDetail({ date, shotIndex: shotIndex ?? Math.max(0, defaultIdx) });

      const url = new URL(window.location.href);
      url.searchParams.set("d", date);
      if (historyMode === "push" && historyOwnerRef.current !== "detail") {
        window.history.pushState({ overlay: "detail" }, "", url);
        historyOwnerRef.current = "detail";
      } else {
        // Already inside the photo view (stepping between days via chevron)
        // — replace, so back from nine days deep returns in one press.
        window.history.replaceState({ overlay: "detail" }, "", url);
      }
    },
    [calendarData],
  );

  const closeDetail = useCallback(() => {
    if (historyOwnerRef.current === "detail") {
      historyOwnerRef.current = null;
      window.history.back();
    }
    setDetail(null);
  }, []);

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

  const handleRegenerateShareLink = useCallback(async () => {
    if (!api.regenerateShareUrl) return;
    const url = await api.regenerateShareUrl();
    setShareUrl(url);
  }, [api]);

  const handleOpenSettings = useCallback(() => {
    setSheetOpen(true);
    if (!shareUrl) fetchShareUrl();

    const url = new URL(window.location.href);
    url.hash = "settings";
    window.history.pushState({ overlay: "sheet" }, "", url);
    historyOwnerRef.current = "sheet";
  }, [shareUrl, fetchShareUrl]);

  const closeSheet = useCallback(() => {
    if (historyOwnerRef.current === "sheet") {
      historyOwnerRef.current = null;
      window.history.back();
    }
    setSheetOpen(false);
  }, []);

  // Hardware/gesture back closes whichever overlay we pushed a history
  // entry for, instead of navigating away from the app entirely.
  useEffect(() => {
    function onPopState() {
      if (historyOwnerRef.current === "detail") {
        historyOwnerRef.current = null;
        setDetail(null);
      } else if (historyOwnerRef.current === "sheet") {
        historyOwnerRef.current = null;
        setSheetOpen(false);
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Deep link on load: `?d=2026-08-11` (or `?d=today`, used by the PWA
  // shortcut) opens that day's photo view; `#settings` opens the sheet. The
  // current entry is rewritten to a clean base first so a single back press
  // lands on the calendar rather than leaving the app.
  useEffect(() => {
    const url = new URL(window.location.href);
    const dParam = url.searchParams.get("d");
    if (dParam) {
      const date = dParam === "today" ? today : dParam;
      window.history.replaceState({ overlay: null }, "", url.pathname);
      // Legitimate one-time sync from the URL the page loaded with, not a
      // derived-state loop — see https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
      // eslint-disable-next-line react-hooks/set-state-in-effect
      openDetailFor(date, undefined, "push");
    } else if (url.hash === "#settings") {
      window.history.replaceState({ overlay: null }, "", url.pathname);
      handleOpenSettings();
    }
    // Intentionally mount-only: this reads the URL the page loaded with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopyLink = useCallback(async () => {
    const url = shareUrl ?? (await fetchShareUrl());
    if (url) await navigator.clipboard.writeText(url).catch(() => {});
  }, [shareUrl, fetchShareUrl]);

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
    earliestDate: dayKeys.length > 0 ? dayKeys[0] : null,
  };

  return (
    <>
      {isDesktop ? (
        <WebShell
          {...shellProps}
          account={accountState}
          pickerState={pickerImport.state}
          pickerPhotosAdded={pickerImport.photosAdded}
          pickerError={pickerImport.error}
          shareUrl={shareUrl}
          onAddPhotos={pickerImport.start}
          onCopyShareLink={handleCopyLink}
          onRegenerateShareLink={handleRegenerateShareLink}
        />
      ) : (
        <MobileShell
          {...shellProps}
          syncing={pickerImport.state === "waiting" || pickerImport.state === "importing"}
          onRefresh={pickerImport.start}
          onOpenSettings={handleOpenSettings}
        />
      )}

      {detail && detailDay && (
        // isLandscape checked first, ahead of isDesktop, as defense in
        // depth: a rotated phone (short + landscape) always gets the phone
        // treatment even if a width-based desktop heuristic ever misfires.
        isLandscape ? (
          <LandscapePhotoView
            date={detail.date}
            shotIndex={detail.shotIndex}
            day={detailDay}
            timezone={timezone}
            dayKeys={dayKeys}
            readOnly={readOnly}
            onClose={closeDetail}
            onNavigate={(d) => openDetailFor(d, undefined, "replace")}
            onChangeShotIndex={changeShotIndex}
            onSetDayPhoto={handleSetDayPhoto}
          />
        ) : isDesktop ? (
          <WebPhotoView
            date={detail.date}
            shotIndex={detail.shotIndex}
            day={detailDay}
            timezone={timezone}
            dayKeys={dayKeys}
            readOnly={readOnly}
            onClose={closeDetail}
            onNavigate={(d) => openDetailFor(d, undefined, "replace")}
            onChangeShotIndex={changeShotIndex}
            onSetDayPhoto={handleSetDayPhoto}
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
            onNavigate={(d) => openDetailFor(d, undefined, "replace")}
            onChangeShotIndex={changeShotIndex}
            onSetDayPhoto={handleSetDayPhoto}
          />
        )
      )}

      {sheetOpen && !readOnly && accountState && (
        <SettingsSheet
          account={accountState}
          timezone={timezone}
          shareUrl={shareUrl}
          pickerState={pickerImport.state}
          pickerPhotosAdded={pickerImport.photosAdded}
          pickerError={pickerImport.error}
          manualPickerUri={pickerImport.manualPickerUri}
          onClose={closeSheet}
          onAddPhotos={pickerImport.start}
          onCopyLink={handleCopyLink}
          onRegenerateLink={handleRegenerateShareLink}
          onChangeAccount={() => {
            window.location.href = "/api/auth/google/login";
          }}
        />
      )}
    </>
  );
}
