"use client";

import { addDays, dayOfMonth, formatLongDate, formatTime } from "@/lib/dates";
import type { AccountInfo, DayData, Stats, SyncInfo, ZoomLevel } from "@/lib/types";
import { WebZoomBar } from "./WebZoomBar";
import { MonthZoomView } from "./MonthZoomView";
import { WeekZoomView } from "./WeekZoomView";
import { YearZoomView } from "./YearZoomView";
import styles from "./WebShell.module.css";

interface WebShellProps {
  today: string;
  timezone: string;
  readOnly: boolean;
  zoom: ZoomLevel;
  onZoomChange(zoom: ZoomLevel): void;
  filter: boolean;
  onFilterChange(filter: boolean): void;
  stats: Stats;
  getDay(date: string): DayData | undefined;
  ensureLoaded(start: string, end: string): Promise<void>;
  onOpenDay(date: string): void;
  onJumpToMonth(monthKey: string): void;
  jumpMonth?: string;
  firstMonthLabel: string | null;
  account?: AccountInfo;
  syncInfo?: SyncInfo;
  shareUrl?: string | null;
  syncing?: boolean;
  onFetchNow?(): void;
  onCopyShareLink?(): void;
}

export function WebShell({
  today,
  timezone,
  readOnly,
  zoom,
  onZoomChange,
  filter,
  onFilterChange,
  stats,
  getDay,
  ensureLoaded,
  onOpenDay,
  onJumpToMonth,
  jumpMonth,
  firstMonthLabel,
  account,
  syncInfo,
  shareUrl,
  syncing,
  onFetchNow,
  onCopyShareLink,
}: WebShellProps) {
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <div className={styles.main}>
          <div className={styles.header}>
            <div>
              <h1 className={styles.wordmark}>Sunrise</h1>
              <div className={styles.date}>{formatLongDate(today)}</div>
              {firstMonthLabel && (
                <div className={styles.tagline}>Every morning I got up for, since {firstMonthLabel}.</div>
              )}
            </div>
            <WebZoomBar zoom={zoom} onZoomChange={onZoomChange} filter={filter} onFilterChange={onFilterChange} />
          </div>

          {stats.total === 0 && (
            <p className={styles.tagline} style={{ marginBottom: 20 }}>
              Nothing here yet — mornings will start filling in once your album has photos.
            </p>
          )}

          {zoom === "month" && (
            <MonthZoomView
              today={today}
              variant="web"
              filter={filter}
              getDay={getDay}
              ensureLoaded={ensureLoaded}
              onOpenDay={onOpenDay}
              onJumpMonth={jumpMonth}
            />
          )}
          {zoom === "week" && (
            <WeekZoomView
              today={today}
              timezone={timezone}
              variant="web"
              filter={filter}
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
              getDay={getDay}
              ensureLoaded={ensureLoaded}
              onJumpToMonth={onJumpToMonth}
            />
          )}
        </div>

        <div className={styles.rail}>
          <span className={styles.kicker}>THIS YEAR SO FAR</span>
          <div className={styles.totalNumber}>{stats.total}</div>
          <div className={styles.totalLabel}>sunrises captured</div>

          <div className={styles.figureGrid}>
            <div>
              <div className={styles.figureNumber}>{stats.last7}</div>
              <div className={styles.figureLabel}>last 7 days</div>
            </div>
            <div>
              <div className={styles.figureNumber}>{stats.last30}</div>
              <div className={styles.figureLabel}>last 30 days</div>
            </div>
            <div>
              <div className={styles.figureNumber}>{stats.avgPerWeek}</div>
              <div className={styles.figureLabel}>a week, on average</div>
            </div>
            <div>
              <div className={styles.figureNumber}>{stats.currentRun}</div>
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
                  className={styles.thumb}
                  onClick={() => shot && onOpenDay(date)}
                  disabled={!shot}
                >
                  {shot && <img src={shot.thumbUrl} alt="" />}
                  <span className={styles.thumbDate}>{dayOfMonth(date)}</span>
                </button>
              );
            })}
          </div>

          {!readOnly && account && syncInfo && (
            <>
              <div className={styles.divider} />
              <div className={styles.syncLine}>
                {syncInfo.status === "error"
                  ? `Sync failed — ${syncInfo.error ?? "try again"}.`
                  : syncInfo.lastSyncedAt
                    ? `Synced ${formatTime(new Date(syncInfo.lastSyncedAt), timezone)} from Google Photos, album '${account.albumName}'.`
                    : `Not synced yet from Google Photos, album '${account.albumName}'.`}
              </div>
              <div className={styles.syncActions}>
                <button type="button" className={styles.secondaryPill} onClick={onFetchNow} disabled={syncing}>
                  {syncing ? "Fetching…" : "Fetch now"}
                </button>
                <button type="button" className={styles.accentPill} onClick={onCopyShareLink}>
                  Copy link
                </button>
              </div>
              {shareUrl && <div className={styles.shareUrl}>{shareUrl}</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
