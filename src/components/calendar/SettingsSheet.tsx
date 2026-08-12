"use client";

import { useState } from "react";
import { formatTime } from "@/lib/dates";
import type { AccountInfo, SyncInfo } from "@/lib/types";
import styles from "./SettingsSheet.module.css";

interface SettingsSheetProps {
  account: AccountInfo;
  syncInfo: SyncInfo;
  timezone: string;
  shareUrl: string | null;
  syncing: boolean;
  onClose(): void;
  onToggleAutoSync(value: boolean): void;
  onFetchNow(): void;
  onCopyLink(): void;
  onChangeAccount(): void;
  onSwitchAlbum(): void;
}

export function SettingsSheet({
  account,
  syncInfo,
  timezone,
  shareUrl,
  syncing,
  onClose,
  onToggleAutoSync,
  onFetchNow,
  onCopyLink,
  onChangeAccount,
  onSwitchAlbum,
}: SettingsSheetProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopyLink();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const syncLabel =
    syncInfo.status === "error"
      ? `Sync failed — ${syncInfo.error ?? "try again"}`
      : syncInfo.lastSyncedAt
        ? `Synced ${formatTime(new Date(syncInfo.lastSyncedAt), timezone)}`
        : "Not synced yet";

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
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
              <div className={styles.rowMain}>Album — &quot;{account.albumName}&quot;</div>
              <div className={styles.rowSub}>read-only</div>
            </div>
            <button type="button" className={styles.linkAction} onClick={onSwitchAlbum}>
              Switch
            </button>
          </div>

          <div className={styles.row}>
            <div className={styles.rowText}>
              <div className={styles.rowMain}>Fetch once a day</div>
              <div className={styles.rowSub}>{syncLabel}</div>
            </div>
            <button
              type="button"
              className={`${styles.toggle} ${account.autoSync ? styles.toggleOn : ""}`}
              onClick={() => onToggleAutoSync(!account.autoSync)}
              aria-pressed={account.autoSync}
              aria-label="Fetch once a day"
            >
              <span className={styles.knob} />
            </button>
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

        <button type="button" className={styles.fetchNow} onClick={onFetchNow} disabled={syncing}>
          {syncing ? "Fetching…" : "Fetch new photos now"}
        </button>
      </div>
    </div>
  );
}
