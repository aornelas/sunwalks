"use client";

import type { DayData, PlanningDay, Stats, ZoomLevel } from "@/lib/types";
import type { Facet } from "@/lib/facets";
import { MobileHeader } from "./MobileHeader";
import { PlanningEntryRow } from "./PlanningEntryRow";
import { WeekStrip } from "./WeekStrip";
import { StatsLine } from "./StatsLine";
import { MonthZoomView } from "./MonthZoomView";
import { WeekZoomView } from "./WeekZoomView";
import { YearZoomView } from "./YearZoomView";
import { ControlBar } from "./ControlBar";
import { ZoomTransition } from "./ZoomTransition";
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
  onRefresh(): void;
  onOpenSettings(): void;
  newDates?: ReadonlySet<string>;
  animateStats?: boolean;
  planningDay?: PlanningDay;
  planningIsThisMorning?: boolean;
  onOpenPlanning?(): void;
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
  onRefresh,
  onOpenSettings,
  newDates,
  animateStats,
  planningDay,
  planningIsThisMorning,
  onOpenPlanning,
}: MobileShellProps) {
  return (
    <div className={styles.page}>
      <MobileHeader today={today} readOnly={readOnly} syncing={syncing} onRefresh={onRefresh} onOpenSettings={onOpenSettings} />
      {!readOnly && onOpenPlanning && (
        <PlanningEntryRow
          day={planningDay}
          isThisMorning={!!planningIsThisMorning}
          timezone={timezone}
          onOpen={onOpenPlanning}
        />
      )}
      <WeekStrip today={today} getDay={getDay} onOpenDay={onOpenDay} newDates={newDates} />
      <StatsLine stats={stats} animate={animateStats} />
      {stats.total === 0 && (
        <p className={styles.emptyNote}>Nothing here yet — mornings will start filling in once your album has photos.</p>
      )}

      <ZoomTransition zoomKey={zoom}>
        {zoom === "month" && (
          <MonthZoomView
            today={today}
            variant="mobile"
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
            variant="mobile"
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
            variant="mobile"
            filter={filter}
            earliestDate={earliestDate}
            getDay={getDay}
            ensureLoaded={ensureLoaded}
            onJumpToMonth={onJumpToMonth}
          />
        )}
      </ZoomTransition>

      <ControlBar
        zoom={zoom}
        onZoomChange={onZoomChange}
        filter={filter}
        onFilterChange={onFilterChange}
        facet={facet}
        onFacetChange={onFacetChange}
        places={places}
      />
    </div>
  );
}
