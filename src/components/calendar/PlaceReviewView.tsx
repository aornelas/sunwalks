"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { formatLongDate } from "@/lib/dates";
import type { PlaceActions, PlaceReview } from "@/lib/types";
import { PlacePicker } from "./PlacePicker";
import styles from "./PlaceReviewView.module.css";

const SOURCE_TEXT = {
  "walk log": "the walk log",
  "another photo": "another photo that morning",
  landmarks: "the landmarks",
} as const;

interface PlaceReviewViewProps {
  fetchReview(): Promise<PlaceReview>;
  placeActions: PlaceActions;
  onClose(): void;
}

/**
 * Every morning whose photos have no place yet, newest first, each with
 * its spots laid out and the suggestion marked (the walk logged that
 * morning, or the place tagging read from the landmarks). One tap sets
 * the place on the morning's photos and in the walk log.
 */
export function PlaceReviewView({ fetchReview, placeActions, onClose }: PlaceReviewViewProps) {
  const [review, setReview] = useState<PlaceReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    fetchReview()
      .then(setReview)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load the mornings"));
  }, [fetchReview]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const left = review ? review.queue.length - done.size : 0;
  const addSpot = async (name: string, kind: string) => {
    const added = await placeActions.addSpot(name, kind);
    setReview((prev) =>
      prev && !prev.options.includes(added)
        ? { ...prev, options: [...prev.options.slice(0, -1), added, prev.options[prev.options.length - 1]] }
        : prev,
    );
    return added;
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="place-review-title">
      <header className={styles.header}>
        <div>
          <h2 id="place-review-title" className={styles.title}>
            Where were these mornings?
          </h2>
          <p className={styles.sub}>
            {review == null
              ? "Loading…"
              : review.queue.length === 0
                ? "Every morning has a place."
                : `${left} of ${review.queue.length} ${review.queue.length === 1 ? "morning" : "mornings"} left. Each place also goes into the walk log, so the planner learns from it.`}
          </p>
        </div>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
          <X size={18} strokeWidth={2.75} />
        </button>
      </header>

      {error && <p className={styles.error}>{error}</p>}

      <ol className={styles.list}>
        {review?.queue.map((m) => {
          const chosen = done.get(m.date);
          return (
            <li key={m.date} className={`${styles.morning} ${chosen ? styles.morningDone : ""}`}>
              <img className={styles.thumb} src={`/api/photos/${m.photoId}/image?size=sq`} alt="" loading="lazy" />
              <div className={styles.body}>
                <div className={styles.date}>{formatLongDate(m.date)}</div>
                <div className={styles.meta}>
                  {m.photos} {m.photos === 1 ? "photo" : "photos"}
                  {!chosen && m.suggestionSource && ` · suggested from ${SOURCE_TEXT[m.suggestionSource]}`}
                </div>
                {chosen ? (
                  <div className={styles.chosen}>
                    <Check size={14} strokeWidth={3} /> {chosen}
                  </div>
                ) : (
                  <PlacePicker
                    open
                    options={review.options}
                    suggestion={m.suggestion}
                    loadOptions={async () => review.options}
                    addSpot={addSpot}
                    onChoose={async (place) => {
                      await placeActions.setPlace(m.date, place);
                      setDone((prev) => new Map(prev).set(m.date, place));
                    }}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
