"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { formatLongDate, formatTime } from "@/lib/dates";
import { buildSrcSet } from "@/lib/image";
import { EASE_SOFT, prefersReducedMotion } from "@/lib/motion";
import { usePhotoOpenAnimation } from "@/hooks/usePhotoOpenAnimation";
import type { PhotoOrigin } from "@/lib/photo-origin";
import type { DayData } from "@/lib/types";
import { ViewingRing } from "./ViewingRing";
import { SteppingPhoto } from "./SteppingPhoto";
import { CrossfadeText } from "./CrossfadeText";
import styles from "./WebPhotoView.module.css";

interface WebPhotoViewProps {
  date: string;
  shotIndex: number;
  day: DayData;
  timezone: string;
  dayKeys: string[];
  readOnly: boolean;
  origin?: PhotoOrigin | null;
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
  origin,
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

  const { stageRef, scrimRef, closing, requestClose } = usePhotoOpenAnimation(origin ?? null);

  const [lastDate, setLastDate] = useState(date);
  let direction: 1 | -1 | 0 = 0;
  if (date !== lastDate) {
    direction = date > lastDate ? 1 : -1;
    setLastDate(date);
  }

  const photoAreaRef = useRef<HTMLDivElement>(null);
  const rubberBand = (dir: 1 | -1) => {
    if (prefersReducedMotion()) return;
    photoAreaRef.current?.animate(
      [{ transform: "translateX(0)" }, { transform: `translateX(${dir * 12}px)` }, { transform: "translateX(0)" }],
      { duration: 400, easing: EASE_SOFT },
    );
  };

  const thumbRowRef = useRef<HTMLDivElement>(null);
  const thumbRefs = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") {
        if (prevDate) onNavigate(prevDate);
        else rubberBand(1);
      } else if (e.key === "ArrowRight") {
        if (nextDate) onNavigate(nextDate);
        else rubberBand(-1);
      } else if (e.key === "Escape") requestClose(onClose);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevDate, nextDate]);

  return (
    <div className={`${styles.overlay} ${closing ? styles.closing : ""}`}>
      <div ref={scrimRef} className={styles.scrim} />

      <div className={styles.topRow}>
        <div className={styles.dateBlock}>
          <CrossfadeText className={styles.dateLine} text={formatLongDate(date)} />
          <CrossfadeText className={styles.metaLine} text={captionParts} />
        </div>
        <div className={styles.topActions}>
          <button type="button" className={styles.iconButton} onClick={() => requestClose(onClose)} aria-label="Close">
            <X size={18} strokeWidth={2.75} />
          </button>
        </div>
      </div>

      <div ref={photoAreaRef} className={styles.photoArea}>
        <button
          type="button"
          className={`${styles.chevron} ${styles.chevronPrev} ${!prevDate ? styles.chevronDisabled : ""}`}
          onClick={() => (prevDate ? onNavigate(prevDate) : rubberBand(1))}
          aria-label="Previous sunrise"
          aria-disabled={!prevDate}
        >
          <ChevronLeft size={22} strokeWidth={2.75} />
        </button>

        <div ref={stageRef} className={styles.stage}>
          <div className={styles.stageThumb} style={origin ? { backgroundImage: `url(${origin.thumbSrc})` } : undefined} />
          <SteppingPhoto stepKey={`${date}:${shot.id}`} direction={direction}>
            <img {...buildSrcSet(shot.id, "full")} sizes="70vw" alt={formatLongDate(date)} fetchPriority="high" />
          </SteppingPhoto>
        </div>

        <button
          type="button"
          className={`${styles.chevron} ${styles.chevronNext} ${!nextDate ? styles.chevronDisabled : ""}`}
          onClick={() => (nextDate ? onNavigate(nextDate) : rubberBand(-1))}
          aria-label="Next sunrise"
          aria-disabled={!nextDate}
        >
          <ChevronRight size={22} strokeWidth={2.75} />
        </button>
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
          <div ref={thumbRowRef} className={styles.thumbRow}>
            <ViewingRing
              className={styles.viewingRing}
              containerRef={thumbRowRef}
              thumbRefs={thumbRefs}
              activeKey={shot.id}
            />
            {shots.map((s, i) => (
              <button
                key={s.id}
                ref={(el) => {
                  if (el) thumbRefs.current.set(s.id, el);
                  else thumbRefs.current.delete(s.id);
                }}
                type="button"
                className={[styles.thumb, i === shotIndex ? "" : styles.thumbDimmed].join(" ")}
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
