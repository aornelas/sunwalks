"use client";

import { Sunrise } from "lucide-react";
import type { ZoomLevel } from "@/lib/types";
import styles from "./ControlBar.module.css";

const ZOOMS: { key: ZoomLevel; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
];

interface ControlBarProps {
  zoom: ZoomLevel;
  onZoomChange(zoom: ZoomLevel): void;
  filter: boolean;
  onFilterChange(filter: boolean): void;
}

export function ControlBar({ zoom, onZoomChange, filter, onFilterChange }: ControlBarProps) {
  return (
    <div className={styles.bar}>
      <div className={styles.pills}>
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
      </div>
      <button
        type="button"
        className={`${styles.toggle} ${filter ? styles.toggleOn : ""}`}
        onClick={() => onFilterChange(!filter)}
        aria-label="Sunrise days only"
        aria-pressed={filter}
      >
        <Sunrise size={17} strokeWidth={2.75} />
      </button>
    </div>
  );
}
