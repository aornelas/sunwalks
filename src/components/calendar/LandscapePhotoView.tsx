"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Maximize, Minimize, Share2, X } from "lucide-react";
import { formatLongDate, formatTime } from "@/lib/dates";
import { buildSrcSet } from "@/lib/image";
import type { DayData } from "@/lib/types";
import styles from "./LandscapePhotoView.module.css";

interface LandscapePhotoViewProps {
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
  onShare(): void;
}

export function LandscapePhotoView({
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
  onShare,
}: LandscapePhotoViewProps) {
  const [chromeVisible, setChromeVisible] = useState(true);
  const [fit, setFit] = useState(false);

  const shots = day.shots;
  const shot = shots[shotIndex] ?? shots[0];
  const isDayPhoto = shot.id === day.dayShotId;
  const idx = dayKeys.indexOf(date);
  const prevDate = idx > 0 ? dayKeys[idx - 1] : undefined;
  const nextDate = idx >= 0 && idx < dayKeys.length - 1 ? dayKeys[idx + 1] : undefined;

  const time = formatTime(new Date(shot.takenAt), timezone);
  const metaParts = [time, shot.place, shots.length > 1 ? `shot ${shotIndex + 1} of ${shots.length}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={styles.overlay}>
      <img
        className={`${styles.photo} ${fit ? styles.photoContain : styles.photoCover}`}
        {...buildSrcSet(shot.id, "full")}
        sizes="100vw"
        alt={formatLongDate(date)}
        fetchPriority="high"
        onClick={() => setChromeVisible((v) => !v)}
      />

      {chromeVisible && (
        <>
          <div className={styles.scrimTop} />
          <div className={styles.scrimBottom} />

          <div className={styles.topRow}>
            <button type="button" className={styles.chromeButton} onClick={onClose} aria-label="Close">
              <X size={17} strokeWidth={2.75} />
            </button>
            <div className={styles.topActions}>
              <button
                type="button"
                className={styles.chromeButton}
                onClick={() => setFit((f) => !f)}
                aria-label={fit ? "Fill frame" : "Fit whole photo"}
              >
                {fit ? <Maximize size={17} strokeWidth={2.75} /> : <Minimize size={17} strokeWidth={2.75} />}
              </button>
              <button type="button" className={styles.chromeButton} onClick={onShare} aria-label="Share">
                <Share2 size={16} strokeWidth={2.75} />
              </button>
            </div>
          </div>

          {prevDate && (
            <button
              type="button"
              className={`${styles.chevron} ${styles.chevronPrev}`}
              onClick={() => onNavigate(prevDate)}
              aria-label="Previous sunrise"
            >
              <ChevronLeft size={20} strokeWidth={2.75} />
            </button>
          )}
          {nextDate && (
            <button
              type="button"
              className={`${styles.chevron} ${styles.chevronNext}`}
              onClick={() => onNavigate(nextDate)}
              aria-label="Next sunrise"
            >
              <ChevronRight size={20} strokeWidth={2.75} />
            </button>
          )}

          <div className={styles.bottomRow}>
            <div className={styles.dateBlock}>
              <div className={styles.dateLine}>{formatLongDate(date)}</div>
              <div className={styles.metaLine}>{metaParts}</div>
            </div>

            {shots.length > 1 && (
              <div className={styles.shotsBlock}>
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
        </>
      )}
    </div>
  );
}
