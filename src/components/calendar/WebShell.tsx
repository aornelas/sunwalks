"use client";

import { useState } from "react";
import { addDays, dayOfMonth, formatLongDateWithYear, formatTime } from "@/lib/dates";
import { setPendingOrigin } from "@/lib/photo-origin";
import type { AccountInfo, DayData, PlanningDay, Stats, ZoomLevel } from "@/lib/types";
import type { Facet } from "@/lib/facets";
import type { PickerImportState } from "@/hooks/usePickerImport";
import { PlanningEntryRow } from "./PlanningEntryRow";
import { WebZoomBar } from "./WebZoomBar";
import { MonthZoomView } from "./MonthZoomView";
import { WeekZoomView } from "./WeekZoomView";
import { YearZoomView } from "./YearZoomView";
import { ZoomTransition } from "./ZoomTransition";
import { CrossfadeText } from "./CrossfadeText";
import { RollingNumber } from "./RollingNumber";
import styles from "./WebShell.module.css";

interface WebShellProps {
  today: string;
  timezone: string;
  readOnly: boolean;
  zoom: ZoomLevel;
  onZoomChange(zoom: ZoomLevel): void;
  filter: boolean;
  onFilterChange(filter: boolean): void;
  facet: Facet;
  onFacetChange(facet: Facet): void;
  places: string[];
  stats: Stats;
  getDay(date: string): DayData | undefined;
  ensureLoaded(start: string, end: string): Promise<void>;
  onOpenDay(date: string): void;
  onJumpToMonth(monthKey: string): void;
  jumpMonth?: string;
  earliestDate: string | null;
  account?: AccountInfo;
  pickerState?: PickerImportState;
  pickerPhotosAdded?: number | null;
  pickerError?: string | null;
  shareUrl?: string | null;
  onAddPhotos?(): void;
  onCopyShareLink?(): void;
  onRegenerateShareLink?(): Promise<void>;
  newDates?: ReadonlySet<string>;
  animateStats?: boolean;
  planningDay?: PlanningDay;
  planningIsThisMorning?: boolean;
  onOpenPlanning?(): void;
}

export function WebShell({
  today,
  timezone,
  readOnly,
  zoom,
  onZoomChange,
  filter,
  onFilterChange,
  facet,
  onFacetChange,
  places,
  stats,
  getDay,
  ensureLoaded,
  onOpenDay,
  onJumpToMonth,
  jumpMonth,
  earliestDate,
  account,
  pickerState,
  pickerPhotosAdded,
  pickerError,
  shareUrl,
  onAddPhotos,
  onCopyShareLink,
  onRegenerateShareLink,
  newDates,
  animateStats,
  planningDay,
  planningIsThisMorning,
  onOpenPlanning,
}: WebShellProps) {
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const busy = pickerState === "waiting" || pickerState === "importing";
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));

  const handleCopy = () => {
    onCopyShareLink?.();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleRegenerate = async () => {
    if (!onRegenerateShareLink) return;
    const confirmed = window.confirm(
      "Generate a new link? The current link will stop working immediately for anyone who has it.",
    );
    if (!confirmed) return;
    setRegenerating(true);
    try {
      await onRegenerateShareLink();
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <div className={styles.main}>
          <div className={styles.header}>
            <div>
              <h1 className={styles.wordmark}>
                Sunwalks <span className={styles.version}>v2.0</span>
              </h1>
              <div className={styles.date}>{formatLongDateWithYear(today)}</div>
            </div>
            <WebZoomBar
              zoom={zoom}
              onZoomChange={onZoomChange}
              filter={filter}
              onFilterChange={onFilterChange}
              facet={facet}
              onFacetChange={onFacetChange}
              places={places}
            />
          </div>

          {!readOnly && onOpenPlanning && (
            <PlanningEntryRow
              day={planningDay}
              isThisMorning={!!planningIsThisMorning}
              timezone={timezone}
              onOpen={onOpenPlanning}
            />
          )}

          {stats.total === 0 && (
            <p className={styles.tagline} style={{ marginBottom: 20 }}>
              Nothing here yet — mornings will start filling in once your album has photos.
            </p>
          )}

          <ZoomTransition zoomKey={zoom}>
            {zoom === "month" && (
              <MonthZoomView
                today={today}
                variant="web"
                filter={filter}
                earliestDate={earliestDate}
                getDay={getDay}
                ensureLoaded={ensureLoaded}
                onOpenDay={onOpenDay}
                onJumpMonth={jumpMonth}
                newDates={newDates}
              />
            )}
            {zoom === "week" && (
              <WeekZoomView
                today={today}
                timezone={timezone}
                variant="web"
                filter={filter}
                earliestDate={earliestDate}
                getDay={getDay}
                ensureLoaded={ensureLoaded}
                onOpenDay={onOpenDay}
              />
            )}
            {zoom === "year" && (
              <YearZoomView
                today={today}
                variant="web"
                filter={filter}
                earliestDate={earliestDate}
                getDay={getDay}
                ensureLoaded={ensureLoaded}
                onJumpToMonth={onJumpToMonth}
              />
            )}
          </ZoomTransition>
        </div>

        <div className={styles.rail}>
          <span className={styles.kicker}>THIS YEAR SO FAR</span>
          <div className={styles.totalNumber}>
            <RollingNumber value={stats.total} animate={animateStats} />
          </div>
          <div className={styles.totalLabel}>sunwalks</div>

          <div className={styles.figureGrid}>
            <div>
              <div className={styles.figureNumber}>
                <RollingNumber value={stats.thisWeek} animate={animateStats} />/
                <RollingNumber value={stats.bestWeek} animate={animateStats} />
              </div>
              <div className={styles.figureLabel}>this/best week</div>
            </div>
            <div>
              <div className={styles.figureNumber}>
                <RollingNumber value={stats.thisMonth} animate={animateStats} />/
                <RollingNumber value={stats.bestMonth} animate={animateStats} />
              </div>
              <div className={styles.figureLabel}>this/best month</div>
            </div>
            <div>
              <div className={styles.figureNumber}>
                <RollingNumber value={stats.thisYear} animate={animateStats} />/
                <RollingNumber value={stats.bestYear} animate={animateStats} />
              </div>
              <div className={styles.figureLabel}>this/best year</div>
            </div>
            <div>
              <div className={styles.figureNumber}>
                <RollingNumber value={stats.currentRun} animate={animateStats} />
              </div>
              <div className={styles.figureLabel}>days in a row now</div>
            </div>
          </div>

          <div className={styles.divider} />
          <span className={styles.kicker}>LAST 7 MORNINGS</span>
          <div className={styles.thumbGrid}>
            {last7.map((date) => {
              const day = getDay(date);
              const shot = day && (day.shots.find((s) => s.id === day.dayShotId) ?? day.shots[0]);
              return (
                <button
                  key={date}
                  type="button"
                  className={`${styles.thumb} motionPressable`}
                  onClick={(e) => {
                    if (!shot) return;
                    setPendingOrigin(e.currentTarget.getBoundingClientRect(), shot.thumbUrl);
                    onOpenDay(date);
                  }}
                  disabled={!shot}
                >
                  {shot && <img src={shot.thumbUrl} alt="" />}
                  <span className={styles.thumbDate}>{dayOfMonth(date)}</span>
                </button>
              );
            })}
          </div>

          {!readOnly && account && (
            <>
              <div className={styles.divider} />
              <CrossfadeText
                className={styles.syncLine}
                text={
                  pickerState === "error"
                    ? `Couldn't add photos — ${pickerError ?? "try again"}.`
                    : pickerState === "done"
                      ? `Added ${pickerPhotosAdded ?? 0} photos just now.`
                      : account.lastPickedAt
                        ? `Last added ${formatTime(new Date(account.lastPickedAt), timezone)} from Google Photos.`
                        : "Nothing added yet from Google Photos."
                }
              />
              <div className={styles.syncActions}>
                <button type="button" className={styles.secondaryPill} onClick={onAddPhotos} disabled={busy}>
                  {pickerState === "waiting" ? "Waiting…" : pickerState === "importing" ? "Adding…" : "Add photos"}
                </button>
                <button type="button" className={styles.accentPill} onClick={handleCopy}>
                  <CrossfadeText text={copied ? "Link copied" : "Copy link"} duration={280} delay={0} />
                </button>
              </div>
              {shareUrl && (
                <>
                  <div className={styles.shareUrl}>{shareUrl}</div>
                  <button
                    type="button"
                    className={styles.regenerateAction}
                    onClick={handleRegenerate}
                    disabled={regenerating}
                  >
                    {regenerating ? "Generating…" : "Generate new link"}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
