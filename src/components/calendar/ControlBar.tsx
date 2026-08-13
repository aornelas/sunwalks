"use client";

import { useLayoutEffect, useRef } from "react";
import { Sunrise } from "lucide-react";
import type { ZoomLevel } from "@/lib/types";
import { EASE_SOFT, prefersReducedMotion } from "@/lib/motion";
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
  const pillRefs = useRef(new Map<string, HTMLButtonElement>());
  const fillRef = useRef<HTMLSpanElement>(null);
  const mountedRef = useRef(false);

  useLayoutEffect(() => {
    const fill = fillRef.current;
    const target = pillRefs.current.get(zoom);
    if (!fill || !target) return;
    const left = target.offsetLeft;
    const width = target.offsetWidth;
    if (!mountedRef.current || prefersReducedMotion()) {
      fill.style.transform = `translateX(${left}px)`;
      fill.style.width = `${width}px`;
      mountedRef.current = true;
      return;
    }
    fill.animate(
      [{ transform: fill.style.transform, width: fill.style.width }, { transform: `translateX(${left}px)`, width: `${width}px` }],
      { duration: 560, easing: EASE_SOFT, fill: "forwards" },
    );
    fill.style.transform = `translateX(${left}px)`;
    fill.style.width = `${width}px`;
  }, [zoom]);

  return (
    <div className={styles.bar}>
      <div className={styles.pills}>
        <span ref={fillRef} className={styles.pillFill} aria-hidden="true" />
        {ZOOMS.map(({ key, label }) => (
          <button
            key={key}
            ref={(el) => {
              if (el) pillRefs.current.set(key, el);
              else pillRefs.current.delete(key);
            }}
            type="button"
            className={`${styles.pill} motionPressable ${zoom === key ? styles.pillSelected : ""}`}
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
