"use client";

import { Import, Settings } from "lucide-react";
import { formatLongDateWithYear } from "@/lib/dates";
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
          Sunrise Calendar <span className={styles.version}>v1.0</span>
        </h3>
        <div className={styles.date}>{formatLongDateWithYear(today)}</div>
      </div>
      {!readOnly && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={onRefresh}
            disabled={syncing}
            aria-label="Import new photos"
          >
            <Import size={16} strokeWidth={2.75} className={syncing ? styles.spin : ""} />
          </button>
          <button type="button" className={styles.iconButton} onClick={onOpenSettings} aria-label="Source and sharing">
            <Settings size={17} strokeWidth={1.9} />
          </button>
        </div>
      )}
    </div>
  );
}
