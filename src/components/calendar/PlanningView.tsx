"use client";

import { useRef } from "react";
import { ChevronLeft } from "lucide-react";
import { addDays, dayOfMonth, formatLongDate, formatTime, weekdayInitial, weekdayShort } from "@/lib/dates";
import { cloudLabel, fogLevelLabel, toneFor, windDirLabel } from "@/lib/verdict";
import { tickLeftPercent } from "@/lib/timeline";
import { EASE_STANDARD, prefersReducedMotion } from "@/lib/motion";
import { CrossfadeText } from "./CrossfadeText";
import type { PlanningDay, PlanningResponse } from "@/lib/types";
import styles from "./PlanningView.module.css";

interface PlanningViewProps {
  planning: PlanningResponse;
  selectedIndex: number;
  today: string;
  timezone: string;
  onSelectDay(index: number): void;
  onClose(): void;
  onRetry(): void;
}

const MARKS = ["first", "sunrise", "golden"] as const;
type MarkKey = (typeof MARKS)[number];

function markInstant(day: PlanningDay, mark: MarkKey): Date {
  return new Date(mark === "first" ? day.civilTwilightBegin : mark === "sunrise" ? day.sunrise : day.goldenHourEnd);
}

const MARK_LABEL: Record<MarkKey, string> = { first: "First light", sunrise: "Sunrise", golden: "Golden ends" };

function round(n: number): number {
  return Math.round(n);
}

/** "6:24 AM" → "6:24", for the drift line's compact "6:24 → 6:30". */
function timeOnly(iso: string, timezone: string): string {
  return formatTime(new Date(iso), timezone).replace(/\s?(AM|PM)$/, "");
}

function headerKicker(selectedDate: string, today: string): string {
  if (selectedDate === today) return "PLANNING THIS MORNING";
  if (selectedDate === addDays(today, 1)) return "PLANNING TOMORROW";
  return `PLANNING ${weekdayShort(selectedDate).toUpperCase()}`;
}

export function PlanningView({ planning, selectedIndex, today, timezone, onSelectDay, onClose, onRetry }: PlanningViewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { days, windowStartMinutes } = planning;
  const selected = days[selectedIndex];

  const animatedClose = () => {
    const el = rootRef.current;
    if (prefersReducedMotion() || !el) {
      onClose();
      return;
    }
    el
      .animate(
        [
          { opacity: 1, transform: "translateY(0)" },
          { opacity: 0, transform: "translateY(8px)" },
        ],
        { duration: 480, easing: EASE_STANDARD, fill: "forwards" },
      )
      .finished.catch(() => {})
      .finally(onClose);
  };

  if (days.length === 0) {
    return (
      <div ref={rootRef} className={styles.root}>
        <div className={styles.inner}>
          <Header onBack={animatedClose} kicker="PLANNING TOMORROW" />
          {planning.error ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyLine}>Couldn&apos;t load the forecast — {planning.error}.</p>
              <button type="button" className={styles.retry} onClick={onRetry}>
                Try again
              </button>
            </div>
          ) : (
            <>
              <div className={styles.skeletonBar} />
              <div className={styles.skeletonCards}>
                <div className={styles.skeletonCard} />
                <div className={styles.skeletonCard} />
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  const tone = toneFor(selected.verdict);
  const reasonLine =
    planning.stale && planning.error && planning.fetchedAt
      ? `Forecast from ${formatTime(new Date(planning.fetchedAt), timezone)} — couldn't refresh.`
      : selected.reason;

  return (
    <div ref={rootRef} className={styles.root}>
      <div className={styles.inner}>
      <Header onBack={animatedClose} kicker={headerKicker(selected.date, today)} />

      <div className={styles.dateKicker}>{formatLongDate(selected.date).toUpperCase()}</div>
      <h3 className={styles.verdictWord}>
        <CrossfadeText text={selected.verdict} color={tone.dark} duration={240} delay={0} />
      </h3>
      <p className={styles.reasonLine}>
        <CrossfadeText text={reasonLine} duration={240} delay={0} />
      </p>

      <div className={styles.bar}>
        {MARKS.map((mark) => (
          <div
            key={mark}
            className={styles.tick}
            style={{ left: `${tickLeftPercent(markInstant(selected, mark), timezone, windowStartMinutes)}%` }}
          />
        ))}
      </div>
      <div className={styles.labels}>
        {MARKS.map((mark) => (
          <div
            key={mark}
            className={styles.labelGroup}
            style={{ left: `${tickLeftPercent(markInstant(selected, mark), timezone, windowStartMinutes)}%` }}
          >
            <div className={styles.labelTime}>{formatTime(markInstant(selected, mark), timezone)}</div>
            <div className={styles.labelText}>{MARK_LABEL[mark]}</div>
          </div>
        ))}
      </div>

      <div className={styles.cards}>
        <div className={styles.card}>
          <div className={styles.cardKicker}>Cloud</div>
          <div className={styles.cardFigure}>
            <CrossfadeText text={`${round(selected.cloudTotal)}%`} duration={240} delay={0} />
          </div>
          <div className={styles.meterTrack}>
            <div className={styles.meterBand} />
            <div
              className={styles.meterKnob}
              style={{ left: `${selected.cloudTotal}%`, background: tone.dark }}
            />
          </div>
          <div className={styles.cardCaption}>
            <CrossfadeText text={cloudLabel(selected)} duration={240} delay={0} />
          </div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardKicker}>Out there</div>
          <div className={styles.cardFigure}>
            <CrossfadeText text={`${round(selected.tempAtSunrise)}°`} duration={240} delay={0} />
          </div>
          <div className={styles.cardBody}>
            <CrossfadeText
              text={`feels ${round(selected.apparentTemp)}° · ${round(selected.windSpeed)} mph ${windDirLabel(selected.windDir)}\nRain ${round(selected.precipProbability)}% · fog ${fogLevelLabel(selected.fogProbability)}`}
              duration={240}
              delay={0}
              className={styles.cardBodyText}
            />
          </div>
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.weekKicker}>The week ahead</div>
      <div className={styles.week}>
        {days.map((day, i) => {
          const dayTone = toneFor(day.verdict);
          const selectedTile = i === selectedIndex;
          return (
            <button
              type="button"
              key={day.date}
              className={styles.tile}
              onClick={() => onSelectDay(i)}
              aria-label={`${formatLongDate(day.date)}, ${day.verdict}`}
              aria-pressed={selectedTile}
            >
              <div className={styles.tileWeekday}>{weekdayInitial(day.date)}</div>
              <div className={styles.tileDate}>{dayOfMonth(day.date)}</div>
              <div className={styles.tileDot} style={{ background: dayTone.dark }} />
              {selectedTile && <div className={styles.tileUnderline} style={{ background: dayTone.dark }} />}
            </button>
          );
        })}
      </div>
      <div className={styles.driftLine}>
        Sunrise drifts {timeOnly(days[0].sunrise, timezone)} → {timeOnly(days[days.length - 1].sunrise, timezone)} across
        the week. Tap a day to plan it.
      </div>
      </div>
    </div>
  );
}

function Header({ onBack, kicker }: { onBack(): void; kicker: string }) {
  return (
    <div className={styles.header}>
      <button type="button" className={styles.backControl} onClick={onBack}>
        <ChevronLeft size={15} strokeWidth={2.75} />
        <span>Calendar</span>
      </button>
      <div className={styles.contextKicker}>{kicker}</div>
    </div>
  );
}
