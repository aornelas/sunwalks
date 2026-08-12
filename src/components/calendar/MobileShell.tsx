"use client";

import type { DayData, Stats, ZoomLevel } from "@/lib/types";
import { MobileHeader } from "./MobileHeader";
import { WeekStrip } from "./WeekStrip";
import { StatsLine } from "./StatsLine";
import { MonthZoomView } from "./MonthZoomView";
import { WeekZoomView } from "./WeekZoomView";
import { YearZoomView } from "./YearZoomView";
import { ControlBar } from "./ControlBar";
import styles from "./MobileShell.module.css";

interface MobileShellProps {
  today: string;
  timezone: string;
  readOnly: boolean;
  syncing: boolean;
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
  onRefresh(): void;
  onOpenSettings(): void;
}

export function MobileShell({
  today,
  timezone,
  readOnly,
  syncing,
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
  onRefresh,
  onOpenSettings,
}: MobileShellProps) {
  return (
    <div className={styles.page}>
      <MobileHeader today={today} readOnly={readOnly} syncing={syncing} onRefresh={onRefresh} onOpenSettings={onOpenSettings} />
      <WeekStrip today={today} getDay={getDay} onOpenDay={onOpenDay} />
      <StatsLine stats={stats} />
      {stats.total === 0 && (
        <p className={styles.emptyNote}>Nothing here yet — mornings will start filling in once your album has photos.</p>
      )}

      {zoom === "month" && (
        <MonthZoomView
          today={today}
          variant="mobile"
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
          variant="mobile"
          filter={filter}
          getDay={getDay}
          ensureLoaded={ensureLoaded}
          onOpenDay={onOpenDay}
        />
      )}
      {zoom === "year" && (
        <YearZoomView
          today={today}
          variant="mobile"
          filter={filter}
          getDay={getDay}
          ensureLoaded={ensureLoaded}
          onJumpToMonth={onJumpToMonth}
        />
      )}

      <ControlBar zoom={zoom} onZoomChange={onZoomChange} filter={filter} onFilterChange={onFilterChange} />
    </div>
  );
}
