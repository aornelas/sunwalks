"use client";

import type { ZoomLevel } from "@/lib/types";
import styles from "./WebZoomBar.module.css";

const ZOOMS: { key: ZoomLevel; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
];

interface WebZoomBarProps {
  zoom: ZoomLevel;
  onZoomChange(zoom: ZoomLevel): void;
  filter: boolean;
  onFilterChange(filter: boolean): void;
}

export function WebZoomBar({ zoom, onZoomChange, filter, onFilterChange }: WebZoomBarProps) {
  return (
    <div className={styles.bar}>
      {ZOOMS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          className={`${styles.pill} ${zoom === key ? styles.pillSelected : ""}`}
          onClick={() => onZoomChange(key)}
        >
          {label}
        </button>
      ))}
      <button
        type="button"
        className={`${styles.pill} ${styles.filterPill} ${filter ? styles.pillSelected : ""}`}
        onClick={() => onFilterChange(!filter)}
        aria-pressed={filter}
      >
        Sunrise days only
      </button>
    </div>
  );
}
