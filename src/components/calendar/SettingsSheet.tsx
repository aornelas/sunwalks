"use client";

import { useRef, useState } from "react";
import { formatLongDate, formatTime } from "@/lib/dates";
import { EASE_EXIT, prefersReducedMotion } from "@/lib/motion";
import type { AccountInfo } from "@/lib/types";
import type { PickerImportState } from "@/hooks/usePickerImport";
import { CrossfadeText } from "./CrossfadeText";
import styles from "./SettingsSheet.module.css";

const DISMISS_THRESHOLD = 90;
const FLING_VELOCITY = 0.5; // px/ms

interface DragState {
  startY: number;
  lastY: number;
  lastT: number;
  velocity: number;
}

interface SettingsSheetProps {
  account: AccountInfo;
  timezone: string;
  shareUrl: string | null;
  pickerState: PickerImportState;
  pickerPhotosAdded: number | null;
  pickerError: string | null;
  manualPickerUri: string | null;
  onClose(): void;
  onAddPhotos(): void;
  onCopyLink(): void;
  onRegenerateLink(): Promise<void>;
  onChangeAccount(): void;
}

export function SettingsSheet({
  account,
  timezone,
  shareUrl,
  pickerState,
  pickerPhotosAdded,
  pickerError,
  manualPickerUri,
  onClose,
  onAddPhotos,
  onCopyLink,
  onRegenerateLink,
  onChangeAccount,
}: SettingsSheetProps) {
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<DragState | null>(null);

  // Motion 7 ("settings sheet"): plays the dismiss (a drag-off at the
  // fling's own speed, or the plain 400ms exit) then unmounts via onClose.
  const animatedClose = (duration: number, fromPx: number) => {
    const sheet = sheetRef.current;
    if (prefersReducedMotion() || !sheet) {
      onClose();
      return;
    }
    backdropRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: Math.min(duration, 400), fill: "forwards" });
    sheet
      .animate([{ transform: `translateY(${fromPx}px)` }, { transform: "translateY(100%)" }], {
        duration,
        easing: EASE_EXIT,
        fill: "forwards",
      })
      .finished.catch(() => {})
      .finally(onClose);
  };

  const onHandlePointerDown = (e: React.PointerEvent) => {
    // The handle itself is a tiny 36×4px target — without capture, the
    // pointer moves off it within the first few pixels of a real drag,
    // and every subsequent move/up event would go to whatever ends up
    // under the cursor instead of here.
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, lastY: e.clientY, lastT: performance.now(), velocity: 0 };
    setDragging(true);
  };
  const onHandlePointerMove = (e: React.PointerEvent) => {
    const s = dragRef.current;
    if (!s) return;
    const dy = Math.max(0, e.clientY - s.startY);
    const now = performance.now();
    const dt = now - s.lastT;
    // A too-small dt makes px/ms blow up into a false "fling" from ordinary
    // pointermove jitter (two events landing back-to-back with barely any
    // clock time between them) — floor it to a plausible frame interval.
    if (dt > 4) s.velocity = (e.clientY - s.lastY) / dt;
    s.lastY = e.clientY;
    s.lastT = now;
    setDragY(dy);
  };
  const onHandlePointerUp = () => {
    const s = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (!s) return;
    const flinging = s.velocity > FLING_VELOCITY;
    if (dragY > DISMISS_THRESHOLD || flinging) {
      const velocity = Math.max(s.velocity, 0.3);
      const duration = Math.max(280, 400 - velocity * 250);
      animatedClose(duration, dragY);
    } else {
      setDragY(0);
    }
  };

  const handleCopy = () => {
    onCopyLink();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleRegenerate = async () => {
    const confirmed = window.confirm(
      "Generate a new link? The current link will stop working immediately for anyone who has it.",
    );
    if (!confirmed) return;
    setRegenerating(true);
    try {
      await onRegenerateLink();
    } finally {
      setRegenerating(false);
    }
  };

  const busy = pickerState === "waiting" || pickerState === "importing";
  const photosLabel =
    pickerState === "error"
      ? `Couldn't add photos — ${pickerError ?? "try again"}`
      : pickerState === "done"
        ? `Added ${pickerPhotosAdded ?? 0} photos just now`
        : account.lastPickedAt
          ? `Last added ${formatLongDate(account.lastPickedAt.slice(0, 10))} at ${formatTime(new Date(account.lastPickedAt), timezone)}`
          : "Nothing added yet";

  const addPhotosLabel =
    pickerState === "waiting"
      ? "Waiting for you in Google Photos…"
      : pickerState === "importing"
        ? "Adding your photos…"
        : "Add photos";

  return (
    <div ref={backdropRef} className={styles.backdrop} onClick={() => animatedClose(400, 0)}>
      <div
        ref={sheetRef}
        className={`${styles.sheet} ${dragging ? "" : styles.springBack}`}
        style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <span
          className={styles.dragHandle}
          aria-hidden="true"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
        />
        <div className={styles.header}>
          <h3 className={styles.title}>Source &amp; sharing</h3>
          <button type="button" className={styles.done} onClick={() => animatedClose(400, 0)}>
            Done
          </button>
        </div>

        <div className={styles.card}>
          <div className={styles.row}>
            <div className={styles.rowText}>
              <div className={styles.rowMain}>
                <span className={styles.statusDot} />
                {account.email}
              </div>
            </div>
            <button type="button" className={styles.linkAction} onClick={onChangeAccount}>
              Change
            </button>
          </div>

          <div className={styles.row}>
            <div className={styles.rowText}>
              <div className={styles.rowMain}>Photos</div>
              <CrossfadeText className={styles.rowSub} text={photosLabel} />
            </div>
          </div>
        </div>

        <div className={styles.card}>
          <p className={styles.shareDescription}>Anyone with the link can look. Not indexed, no sign-in.</p>
          <div className={styles.shareRow}>
            <span className={styles.urlPill}>{shareUrl ?? "…"}</span>
            <button type="button" className={styles.copyPill} onClick={handleCopy} disabled={!shareUrl}>
              <CrossfadeText text={copied ? "Link copied" : "Copy link"} duration={280} delay={0} />
            </button>
          </div>
          <button
            type="button"
            className={styles.regenerateAction}
            onClick={handleRegenerate}
            disabled={!shareUrl || regenerating}
          >
            {regenerating ? "Generating…" : "Generate new link"}
          </button>
        </div>

        {manualPickerUri && (
          <p className={styles.shareDescription}>
            Your browser blocked the popup —{" "}
            <a href={manualPickerUri} target="_blank" rel="noopener noreferrer">
              open Google Photos manually
            </a>
            .
          </p>
        )}
        <button type="button" className={styles.fetchNow} onClick={onAddPhotos} disabled={busy}>
          {addPhotosLabel}
        </button>
      </div>
    </div>
  );
}
