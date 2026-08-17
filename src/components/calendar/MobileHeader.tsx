"use client";

import { LogIn, Settings } from "lucide-react";
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
          Sunwalks <span className={styles.version}>v1.2</span>
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
            {/* lucide's LogIn draws its rect on the right with the arrow
                entering from the left; mirrored so the arrow instead
                arrives from the right into the rect — reads as "pulling
                photos in" rather than "downloading". Flip lives on this
                wrapper, not the icon itself, so it doesn't fight the
                spin animation's own transform. */}
            <span className={styles.importIconFlip}>
              <LogIn size={16} strokeWidth={2.75} className={syncing ? styles.spin : ""} />
            </span>
          </button>
          <button type="button" className={styles.iconButton} onClick={onOpenSettings} aria-label="Source and sharing">
            <Settings size={17} strokeWidth={1.9} />
          </button>
        </div>
      )}
    </div>
  );
}
