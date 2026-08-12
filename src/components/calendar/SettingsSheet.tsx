"use client";

import { useState } from "react";
import { formatLongDate, formatTime } from "@/lib/dates";
import type { AccountInfo } from "@/lib/types";
import type { PickerImportState } from "@/hooks/usePickerImport";
import styles from "./SettingsSheet.module.css";

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
  onChangeAccount,
}: SettingsSheetProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopyLink();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
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
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <span className={styles.dragHandle} aria-hidden="true" />
        <div className={styles.header}>
          <h3 className={styles.title}>Source &amp; sharing</h3>
          <button type="button" className={styles.done} onClick={onClose}>
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
              <div className={styles.rowSub}>{photosLabel}</div>
            </div>
          </div>
        </div>

        <div className={styles.card}>
          <p className={styles.shareDescription}>Anyone with the link can look. Not indexed, no sign-in.</p>
          <div className={styles.shareRow}>
            <span className={styles.urlPill}>{shareUrl ?? "…"}</span>
            <button type="button" className={styles.copyPill} onClick={handleCopy} disabled={!shareUrl}>
              {copied ? "Link copied" : "Copy link"}
            </button>
          </div>
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
