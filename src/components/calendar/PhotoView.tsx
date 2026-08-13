"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { formatLongDate, formatTime } from "@/lib/dates";
import { buildSrcSet } from "@/lib/image";
import type { DayData } from "@/lib/types";
import styles from "./PhotoView.module.css";

const DISMISS_THRESHOLD = 110;

interface DragState {
  startX: number;
  startY: number;
  dragging: boolean;
}

interface PhotoViewProps {
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

export function PhotoView({
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
}: PhotoViewProps) {
  const shots = day.shots;
  const shot = shots[shotIndex] ?? shots[0];
  const isDayPhoto = shot.id === day.dayShotId;
  const idx = dayKeys.indexOf(date);
  const prevDate = idx > 0 ? dayKeys[idx - 1] : undefined;
  const nextDate = idx >= 0 && idx < dayKeys.length - 1 ? dayKeys[idx + 1] : undefined;

  const time = formatTime(new Date(shot.takenAt), timezone);
  const metaParts = [time, shot.place].filter(Boolean).join(" · ");
  const captionParts = [time, shot.place, shots.length > 1 ? `shot ${shotIndex + 1} of ${shots.length}` : null]
    .filter(Boolean)
    .join(" · ");

  // Vertical swipe-down-to-dismiss (ANDROID_UPDATE.md §4/§5). Horizontal
  // drags are released immediately so the system's edge back-gesture still
  // works — see `touch-action: pan-x` on .photoArea.
  const [dragY, setDragY] = useState(0);
  const [settling, setSettling] = useState(false);
  const dragRef = useRef<DragState | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    setSettling(false);
    dragRef.current = { startX: e.clientX, startY: e.clientY, dragging: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = dragRef.current;
    if (!s) return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    if (!s.dragging) {
      if (Math.abs(dy) < 10 && Math.abs(dx) < 10) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        dragRef.current = null; // horizontal — leave it to the system gesture
        return;
      }
      s.dragging = true;
    }
    if (dy > 0) setDragY(dy);
  };
  const endDrag = () => {
    const s = dragRef.current;
    dragRef.current = null;
    if (s?.dragging && dragY > DISMISS_THRESHOLD) {
      onClose();
      return;
    }
    setSettling(true);
    setDragY(0);
  };

  return (
    <div
      className={`${styles.overlay} ${settling ? styles.settling : ""}`}
      style={dragY ? { transform: `translateY(${dragY}px)`, opacity: Math.max(1 - dragY / 400, 0.4) } : undefined}
      onTransitionEnd={() => setSettling(false)}
    >
      <div className={styles.topBar}>
        <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Close">
          <X size={18} strokeWidth={2.75} />
        </button>
        <div className={styles.center}>
          <div className={styles.dateLine}>{formatLongDate(date)}</div>
          <div className={styles.metaLine}>{metaParts}</div>
        </div>
        {/* Empty spacer matching the close button's footprint, so the
            centered date/meta text stays visually centered. */}
        <div className={styles.topActions} />
      </div>

      <div
        className={styles.photoArea}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
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
        <img {...buildSrcSet(shot.id, "full")} sizes="100vw" alt={formatLongDate(date)} fetchPriority="high" />
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
      </div>

      <div className={styles.bottomBlock}>
        <div className={styles.caption}>{captionParts}</div>

        {shots.length > 1 && (
          <>
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
                  className={[
                    styles.thumb,
                    i === shotIndex ? styles.thumbViewing : styles.thumbDimmed,
                  ].join(" ")}
                  onClick={() => onChangeShotIndex(i)}
                >
                  <img src={s.thumbUrl} alt="" />
                  {s.id === day.dayShotId && <span className={styles.thumbDayDot} />}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
