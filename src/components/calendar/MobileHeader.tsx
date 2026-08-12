"use client";

import { RefreshCw, Settings } from "lucide-react";
import { formatLongDate } from "@/lib/dates";
import styles from "./MobileHeader.module.css";

interface MobileHeaderProps {
  today: string;
  readOnly: boolean;
  syncing: boolean;
  onRefresh(): void;
  onOpenSettings(): void;
}

export function MobileHeader({ today, readOnly, syncing, onRefresh, onOpenSettings }: MobileHeaderProps) {
  return (
    <div className={styles.header}>
      <div>
        <h3 className={styles.wordmark}>
          Sunrise Calendar <span className={styles.version}>v0.1</span>
        </h3>
        <div className={styles.date}>{formatLongDate(today)}</div>
      </div>
      {!readOnly && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={onRefresh}
            disabled={syncing}
            aria-label="Fetch new photos"
          >
            <RefreshCw size={16} strokeWidth={2.75} className={syncing ? styles.spin : ""} />
          </button>
          <button type="button" className={styles.iconButton} onClick={onOpenSettings} aria-label="Source and sharing">
            <Settings size={17} strokeWidth={1.9} />
          </button>
        </div>
      )}
    </div>
  );
}
