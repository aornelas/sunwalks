"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { useLandscapePhoto } from "@/hooks/useLandscapePhoto";
import { useCalendarData } from "@/hooks/useCalendarData";
import { usePickerImport } from "@/hooks/usePickerImport";
import { createOwnerApi, createShareApi } from "@/lib/api-client";
import { consumePendingOrigin, type PhotoOrigin } from "@/lib/photo-origin";
import { NO_FACET, withFacet, type Facet } from "@/lib/facets";
import type { AccountInfo, DayData, PlanningResponse, Stats, ZoomLevel } from "@/lib/types";
import { MobileShell } from "./MobileShell";
import { WebShell } from "./WebShell";
import { PhotoView } from "./PhotoView";
import { WebPhotoView } from "./WebPhotoView";
import { LandscapePhotoView } from "./LandscapePhotoView";
import { SettingsSheet } from "./SettingsSheet";
import { PlanningView } from "./PlanningView";

const EMPTY_PLANNING: PlanningResponse = {
  days: [],
  windowStartMinutes: 330,
  windowEndMinutes: 450,
  fetchedAt: null,
  stale: true,
};

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
  initialPlanning?: PlanningResponse;
  account?: AccountInfo;
  /** The owner's named places, for the place filter. Never passed on the share link. */
  places?: string[];
}

export function CalendarApp({
  readOnly,
  shareToken,
  timezone,
  today,
  initialDays,
  initialStats,
  initialDayKeys,
  initialPlanning,
  account,
  places = [],
}: CalendarAppProps) {
  const api = useMemo(
    () => (readOnly && shareToken ? createShareApi(shareToken) : createOwnerApi()),
    [readOnly, shareToken],
  );
  const calendarData = useCalendarData(api, initialDays, initialStats);
  const pickerImport = usePickerImport(api);

  // A picker import refreshes just the affected range in place (see the
  // "done" effect below) rather than reloading the page, so this needs to
  // be mutable state now — it's what feeds motion 5's "new morning lands".
  const [dayKeys, setDayKeys] = useState<string[]>(initialDayKeys);
  const [newDates, setNewDates] = useState<ReadonlySet<string> | undefined>(undefined);
  const [justSynced, setJustSynced] = useState(false);
  const accountState = account;

  // Month + (for a shared, read-only viewer) sunwalk-days-only is the
  // sensible first impression; a returning visitor's actual choice then
  // overrides this once the cookie-read effect below runs.
  const [zoom, setZoom] = useState<ZoomLevel>("month");
  const [filter, setFilter] = useState(readOnly);
  const [facet, setFacet] = useState<Facet>(NO_FACET);
  const [prefsReady, setPrefsReady] = useState(false);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [photoOrigin, setPhotoOrigin] = useState<PhotoOrigin | null>(null);
  // Rotating the phone swaps PhotoView/WebPhotoView/LandscapePhotoView for
  // one another — CalendarApp doesn't remount when that happens, but each
  // of those three does. Owning this ref here (instead of inside
  // usePhotoOpenAnimation) is what lets it survive that swap, so the fresh
  // instance can tell "rotation, already entered" apart from "real open"
  // and skip replaying the entrance. See usePhotoOpenAnimation's doc.
  const hasEnteredRef = useRef(false);
  const [jumpMonth, setJumpMonth] = useState<{ month: string; nonce: number } | undefined>();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [planning, setPlanning] = useState<PlanningResponse | undefined>(initialPlanning);
  const [planningOpen, setPlanningOpen] = useState(false);
  const [planningIndex, setPlanningIndex] = useState(0);

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
  // everywhere: the grid, stats, the prev/next day-key list, the "last
  // added" line — and, per motion 5 ("a new morning lands"), the squares
  // that just flipped from missed/future to captured get a pop + ripple.
  // That reveal only works if the page stays alive through it, so this
  // refreshes just the affected range in place instead of reloading.
  useEffect(() => {
    if (pickerImport.state !== "done") return;
    let cancelled = false;
    (async () => {
      const freshDayKeys = await api.fetchDayKeys();
      if (cancelled) return;
      const oldSet = new Set(dayKeys);
      const added = freshDayKeys.filter((d) => !oldSet.has(d)).sort();
      setDayKeys(freshDayKeys);
      setJustSynced(true);
      window.setTimeout(() => setJustSynced(false), 1600);
      await calendarData.refreshStats();
      // Refresh every day the import actually touched, not just ones brand
      // new to the calendar — adding more shots to an already-captured day
      // left that day's cached shot list stale until a full page reload,
      // since it never shows up in the "added" diff above.
      const touched = new Set([...added, ...(pickerImport.touchedDays ?? [])]);
      if (touched.size > 0) {
        const earliest = [...touched].sort()[0];
        await calendarData.refreshRange(earliest, today);
        if (cancelled) return;
      }
      if (added.length > 0) {
        const capped = new Set(added.slice(0, 5));
        setNewDates(capped);
        window.setTimeout(() => setNewDates(undefined), capped.size * 160 + 1240 + 200);
      }
    })();
    return () => {
      cancelled = true;
    };
    // dayKeys/calendarData/today are read, not depended on — this should
    // only ever fire on the state transition into "done".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerImport.state]);

  const isDesktop = useIsDesktop();
  const isLandscape = useLandscapePhoto();

  // Tracks which overlay currently owns the top history entry we pushed, so
  // the popstate handler knows what to close and our own close buttons know
  // whether to walk history back (see ANDROID_UPDATE.md §3).
  const historyOwnerRef = useRef<"detail" | "sheet" | "planning" | null>(null);

  useEffect(() => {
    document.body.style.overflow = detail || sheetOpen || planningOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [detail, sheetOpen, planningOpen]);

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
    // The photo view and planning view are near-black overlays; without
    // this the Android status bar (and installed app's task-switcher
    // chrome) stays the app's light theme color and reads as a pale bar
    // floating over dark content. #17140f matches --photo-ground exactly.
    //
    // Replacing the whole <meta> node, not mutating its `content` via
    // setAttribute, is deliberate: Chrome on Android has repainted the
    // status bar off a *mutated* theme-color meta unreliably in testing —
    // most often on the transition back to the lighter colour, leaving a
    // stale grey band that only clears on a full app relaunch. Swapping in
    // a fresh element forces it to re-detect the tag and repaint cleanly.
    const color = detail || planningOpen ? "#17140f" : "#f5ead8";
    const current = document.querySelector('meta[name="theme-color"]');
    const next = document.createElement("meta");
    next.setAttribute("name", "theme-color");
    next.setAttribute("content", color);
    if (current) current.replaceWith(next);
    else document.head.appendChild(next);
  }, [detail, planningOpen]);

  const openDetailFor = useCallback(
    async (date: string, shotIndex?: number, historyMode: "push" | "replace" = "push") => {
      // Consumed synchronously, before any await, so it reflects whatever
      // the triggering click handler set this same tick — never a stale
      // origin from a previous open (see photo-origin.ts).
      const origin = consumePendingOrigin();
      // "replace" means we're already inside the photo view, stepping
      // between days — not a fresh open, so the entrance shouldn't replay.
      if (historyMode !== "replace") hasEnteredRef.current = false;
      if (!calendarData.getDay(date)) {
        await calendarData.ensureLoaded(date, date);
      }
      const day = calendarData.getDay(date);
      if (!day || day.shots.length === 0) return;
      const defaultIdx = day.shots.findIndex((s) => s.id === day.dayShotId);
      setDetail({ date, shotIndex: shotIndex ?? Math.max(0, defaultIdx) });
      setPhotoOrigin(origin);

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
    setPhotoOrigin(null);
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

  const refreshPlanning = useCallback(() => {
    api.fetchPlanning?.().then(setPlanning).catch(() => {});
  }, [api]);

  // Fetched client-side, after first paint — not part of the initial
  // server render, since it can involve a live Open-Meteo call and
  // shouldn't hold up the calendar itself. The entry row shows "Checking
  // forecast…" for the brief gap until this resolves.
  useEffect(() => {
    if (readOnly || initialPlanning) return;
    refreshPlanning();
    // Mount-only: refreshPlanning is stable per `api`, which doesn't change
    // across the component's lifetime for a given readOnly/shareToken pair.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

  const openPlanning = useCallback(() => {
    setPlanningIndex(0);
    setPlanningOpen(true);

    const url = new URL(window.location.href);
    url.hash = "plan";
    window.history.pushState({ overlay: "planning" }, "", url);
    historyOwnerRef.current = "planning";

    // The row/view already show whatever's cached; this refreshes it if the
    // server decides the cache is stale (see PLANNING.md's refresh cadence).
    refreshPlanning();
  }, [refreshPlanning]);

  const closePlanning = useCallback(() => {
    if (historyOwnerRef.current === "planning") {
      historyOwnerRef.current = null;
      window.history.back();
    }
    setPlanningOpen(false);
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
      } else if (historyOwnerRef.current === "planning") {
        historyOwnerRef.current = null;
        setPlanningOpen(false);
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
  // The grids see only matching shots; the photo view keeps the whole day.
  const facetedGetDay = useMemo(() => withFacet(calendarData.getDay, facet), [calendarData.getDay, facet]);

  const shellProps = {
    today,
    timezone,
    readOnly,
    zoom,
    onZoomChange: setZoom,
    filter,
    onFilterChange: setFilter,
    facet,
    onFacetChange: setFacet,
    places: readOnly ? [] : places,
    stats: calendarData.stats,
    getDay: facetedGetDay,
    ensureLoaded: calendarData.ensureLoaded,
    onOpenDay: openDetailFor,
    onJumpToMonth: handleJumpToMonth,
    jumpMonth: jumpMonth?.month,
    earliestDate: dayKeys.length > 0 ? dayKeys[0] : null,
    newDates,
    animateStats: justSynced,
    planningDay: !readOnly ? planning?.days[0] : undefined,
    planningIsThisMorning: planning?.days[0]?.date === today,
    onOpenPlanning: openPlanning,
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
            origin={photoOrigin}
            enteredRef={hasEnteredRef}
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
            origin={photoOrigin}
            enteredRef={hasEnteredRef}
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
            origin={photoOrigin}
            enteredRef={hasEnteredRef}
            onClose={closeDetail}
            onNavigate={(d) => openDetailFor(d, undefined, "replace")}
            onChangeShotIndex={changeShotIndex}
            onSetDayPhoto={handleSetDayPhoto}
          />
        )
      )}

      {planningOpen && !readOnly && (
        <PlanningView
          planning={planning ?? EMPTY_PLANNING}
          selectedIndex={planningIndex}
          today={today}
          timezone={timezone}
          onSelectDay={setPlanningIndex}
          onClose={closePlanning}
          onRetry={refreshPlanning}
        />
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
