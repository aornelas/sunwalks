"use client";

import { CATEGORY_ORDER, type Facet } from "@/lib/facets";
import type { VerdictWord } from "@/lib/verdict";
import styles from "./FacetSelects.module.css";

interface FacetSelectsProps {
  facet: Facet;
  onFacetChange(facet: Facet): void;
  /** Empty on the share link, which never sees places. */
  places: string[];
}

/** The sky and place filters as two native selects: compact, and the platform's own picker on a phone. */
export function FacetSelects({ facet, onFacetChange, places }: FacetSelectsProps) {
  return (
    <div className={styles.group}>
      <select
        className={`${styles.select} ${facet.category ? styles.selectActive : ""}`}
        value={facet.category ?? ""}
        onChange={(e) => onFacetChange({ ...facet, category: (e.target.value || null) as VerdictWord | null })}
        aria-label="Filter by sky"
      >
        <option value="">Any sky</option>
        {CATEGORY_ORDER.map((word) => (
          <option key={word} value={word}>
            {word}
          </option>
        ))}
      </select>
      {places.length > 0 && (
        <select
          className={`${styles.select} ${facet.place ? styles.selectActive : ""}`}
          value={facet.place ?? ""}
          onChange={(e) => onFacetChange({ ...facet, place: e.target.value || null })}
          aria-label="Filter by place"
        >
          <option value="">Anywhere</option>
          {places.map((place) => (
            <option key={place} value={place}>
              {place}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
