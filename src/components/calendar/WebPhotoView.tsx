"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { formatLongDate, formatTime } from "@/lib/dates";
import { buildSrcSet } from "@/lib/image";
import type { DayData } from "@/lib/types";
import styles from "./WebPhotoView.module.css";

interface WebPhotoViewProps {
  date: string;
  shotIndex: number;
  day: DayData;
  timezone: string;
  dayKeys: string[];
  readOnly: boolean;
  onClose(): void;
  onNavigate(date: string): void;
  onChangeShotIndex(index: number): void;
  onSetDayPhoto(shotId: string): void;
}

export function WebPhotoView({
  date,
  shotIndex,
  day,
  timezone,
  dayKeys,
  readOnly,
  onClose,
  onNavigate,
  onChangeShotIndex,
  onSetDayPhoto,
}: WebPhotoViewProps) {
  const shots = day.shots;
  const shot = shots[shotIndex] ?? shots[0];
  const isDayPhoto = shot.id === day.dayShotId;
  const idx = dayKeys.indexOf(date);
  const prevDate = idx > 0 ? dayKeys[idx - 1] : undefined;
  const nextDate = idx >= 0 && idx < dayKeys.length - 1 ? dayKeys[idx + 1] : undefined;

  const time = formatTime(new Date(shot.takenAt), timezone);
  const captionParts = [time, shot.place, shots.length > 1 ? `shot ${shotIndex + 1} of ${shots.length}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={styles.overlay}>
      <div className={styles.topRow}>
        <div className={styles.dateBlock}>
          <div className={styles.dateLine}>{formatLongDate(date)}</div>
          <div className={styles.metaLine}>{captionParts}</div>
        </div>
        <div className={styles.topActions}>
          <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2.75} />
          </button>
        </div>
      </div>

      <div className={styles.photoArea}>
        {prevDate && (
          <button
            type="button"
            className={`${styles.chevron} ${styles.chevronPrev}`}
            onClick={() => onNavigate(prevDate)}
            aria-label="Previous sunrise"
          >
            <ChevronLeft size={22} strokeWidth={2.75} />
          </button>
        )}
        <img {...buildSrcSet(shot.id, "full")} sizes="70vw" alt={formatLongDate(date)} fetchPriority="high" />
        {nextDate && (
          <button
            type="button"
            className={`${styles.chevron} ${styles.chevronNext}`}
            onClick={() => onNavigate(nextDate)}
            aria-label="Next sunrise"
          >
            <ChevronRight size={22} strokeWidth={2.75} />
          </button>
        )}
      </div>

      {shots.length > 1 && (
        <div className={styles.bottomBlock}>
          <div className={styles.shotsRow}>
            <span className={styles.shotsKicker}>{shots.length} SHOTS THIS MORNING</span>
            {!readOnly &&
              (isDayPhoto ? (
                <span className={`${styles.dayPhotoPill} ${styles.pillInert}`}>Day photo</span>
              ) : (
                <button
                  type="button"
                  className={`${styles.dayPhotoPill} ${styles.pillCommit}`}
                  onClick={() => onSetDayPhoto(shot.id)}
                >
                  Set as day photo
                </button>
              ))}
          </div>
          <div className={styles.thumbRow}>
            {shots.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className={[styles.thumb, i === shotIndex ? styles.thumbViewing : styles.thumbDimmed].join(" ")}
                onClick={() => onChangeShotIndex(i)}
              >
                <img src={s.thumbUrl} alt="" />
                {s.id === day.dayShotId && <span className={styles.thumbDayDot} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
