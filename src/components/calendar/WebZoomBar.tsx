"use client";

import { useLayoutEffect, useRef } from "react";
import type { ZoomLevel } from "@/lib/types";
import { EASE_SOFT, prefersReducedMotion } from "@/lib/motion";
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
  const pillRefs = useRef(new Map<string, HTMLButtonElement>());
  const zoomGroupRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const mountedRef = useRef(false);
  const zoomRef = useRef(zoom);

  useLayoutEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

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

  // Same rationale as ControlBar: a rotation/resize can change pill sizes
  // without `zoom` changing, so re-snap the fill whenever the row resizes.
  useLayoutEffect(() => {
    const container = zoomGroupRef.current;
    const fill = fillRef.current;
    if (!container || !fill) return;
    const observer = new ResizeObserver(() => {
      const target = pillRefs.current.get(zoomRef.current);
      if (!target) return;
      // A finished animate() call from the last zoom change still holds its
      // end frame (fill: "forwards") and outranks a plain style assignment,
      // so a direct set here would be silently ignored — cancel it first.
      fill.getAnimations().forEach((anim) => anim.cancel());
      fill.style.transform = `translateX(${target.offsetLeft}px)`;
      fill.style.width = `${target.offsetWidth}px`;
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={styles.bar}>
      <div className={styles.zoomGroup} ref={zoomGroupRef}>
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
        className={`${styles.pill} motionPressable ${styles.filterPill} ${filter ? styles.pillSelectedSolid : ""}`}
        onClick={() => onFilterChange(!filter)}
        aria-pressed={filter}
      >
        Sunwalk days only
      </button>
    </div>
  );
}
