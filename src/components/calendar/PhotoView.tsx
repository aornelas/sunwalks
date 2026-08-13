"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { formatLongDate, formatTime } from "@/lib/dates";
import { buildSrcSet } from "@/lib/image";
import { EASE_SOFT, prefersReducedMotion } from "@/lib/motion";
import { usePhotoOpenAnimation, decodeThenNotify } from "@/hooks/usePhotoOpenAnimation";
import type { PhotoOrigin } from "@/lib/photo-origin";
import type { DayData } from "@/lib/types";
import { ViewingRing } from "./ViewingRing";
import { SteppingPhoto } from "./SteppingPhoto";
import { CrossfadeText } from "./CrossfadeText";
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
  origin?: PhotoOrigin | null;
  /** See usePhotoOpenAnimation's doc comment — owned by CalendarApp, survives a rotation remount. */
  enteredRef?: RefObject<boolean>;
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
  origin,
  enteredRef,
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

  const { stageRef, thumbRef, scrimRef, closing, requestClose, skipEntrance, notifyPhotoLoaded } = usePhotoOpenAnimation(
    origin ?? null,
    enteredRef,
  );

  // Motion 9: direction of travel, derived from the date the view just had
  // vs. what it has now (day keys sort lexically). Adjusting state during
  // render, not a ref — see https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
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
    <div
      className={`${styles.overlay} ${settling ? styles.settling : ""} ${closing ? styles.closing : ""} ${skipEntrance ? styles.noEntrance : ""}`}
      style={dragY ? { transform: `translateY(${dragY}px)`, opacity: Math.max(1 - dragY / 400, 0.4) } : undefined}
      onTransitionEnd={() => setSettling(false)}
    >
      <div ref={scrimRef} className={styles.scrim} />

      <div className={styles.topBar}>
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => requestClose(onClose)}
          aria-label="Close"
        >
          <X size={18} strokeWidth={2.75} />
        </button>
        <div className={styles.center}>
          <CrossfadeText className={styles.dateLine} text={formatLongDate(date)} />
          <CrossfadeText className={styles.metaLine} text={metaParts} />
        </div>
        {/* Empty spacer matching the close button's footprint, so the
            centered date/meta text stays visually centered. */}
        <div className={styles.topActions} />
      </div>

      <div
        ref={photoAreaRef}
        className={styles.photoArea}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <button
          type="button"
          className={`${styles.chevron} ${styles.chevronPrev} ${!prevDate ? styles.chevronDisabled : ""}`}
          onClick={() => (prevDate ? onNavigate(prevDate) : rubberBand(1))}
          aria-label="Previous sunrise"
          aria-disabled={!prevDate}
        >
          <ChevronLeft size={20} strokeWidth={2.75} />
        </button>

        <div
          ref={thumbRef}
          className={styles.stageThumb}
          style={origin ? { backgroundImage: `url(${origin.thumbSrc})` } : undefined}
        />
        <div ref={stageRef} className={styles.stage}>
          <SteppingPhoto stepKey={`${date}:${shot.id}`} direction={direction}>
            <img
              {...buildSrcSet(shot.id, "full")}
              sizes="100vw"
              alt={formatLongDate(date)}
              fetchPriority="high"
              onLoad={decodeThenNotify(notifyPhotoLoaded)}
              onError={notifyPhotoLoaded}
            />
          </SteppingPhoto>
        </div>

        <button
          type="button"
          className={`${styles.chevron} ${styles.chevronNext} ${!nextDate ? styles.chevronDisabled : ""}`}
          onClick={() => (nextDate ? onNavigate(nextDate) : rubberBand(-1))}
          aria-label="Next sunrise"
          aria-disabled={!nextDate}
        >
          <ChevronRight size={20} strokeWidth={2.75} />
        </button>
      </div>

      <div className={styles.bottomBlock}>
        <CrossfadeText className={styles.caption} text={captionParts} />

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
          </>
        )}
      </div>
    </div>
  );
}
