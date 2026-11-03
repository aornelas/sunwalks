"use client";

import { useState } from "react";
import { Check, MapPin, Plus } from "lucide-react";
import styles from "./PlacePicker.module.css";

const KINDS = [
  { value: "vantage", label: "Somewhere high" },
  { value: "short_walk", label: "A short walk" },
  { value: "forest", label: "Forest" },
  { value: "waterfront", label: "Waterfront" },
  { value: "travel", label: "Travel" },
  { value: "geocache", label: "Geocache" },
] as const;

interface PlacePickerProps {
  /** The morning's place, if one is set. */
  place?: string;
  /** The suggestion to mark when there's no place yet. */
  suggestion?: string | null;
  /** Spots plus Home. Loaded by the caller, or on first open when omitted. */
  options?: string[];
  /** Starts open, for the review screen. */
  open?: boolean;
  loadOptions(): Promise<string[]>;
  addSpot(name: string, kind: string): Promise<string>;
  onChoose(place: string): Promise<void>;
}

/**
 * Where a morning was: a pill showing the place (or "Add place") that opens
 * into the owner's spots as chips, plus "New spot". Choosing one sets the
 * place on the morning's photos and in the walk log (see lib/places.ts).
 */
export function PlacePicker({ place, suggestion, options: given, open: startOpen, loadOptions, addSpot, onChoose }: PlacePickerProps) {
  const [open, setOpen] = useState(startOpen ?? false);
  const [options, setOptions] = useState<string[] | null>(given ?? null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<string>("vantage");
  const shown = given ?? options;

  const toggle = async () => {
    setError(null);
    if (!open && !shown) {
      try {
        setOptions(await loadOptions());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load your spots");
      }
    }
    setOpen(!open);
  };

  const choose = async (name: string) => {
    setSaving(name);
    setError(null);
    try {
      await onChoose(name);
      if (!startOpen) setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the place");
    } finally {
      setSaving(null);
    }
  };

  const submitNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(newName);
    setError(null);
    try {
      const name = await addSpot(newName.trim(), newKind);
      setOptions((prev) => (prev && !prev.includes(name) ? [...prev.slice(0, -1), name, prev[prev.length - 1]] : prev));
      setAdding(false);
      setNewName("");
      await choose(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the spot");
      setSaving(null);
    }
  };

  return (
    <div className={styles.picker}>
      {!startOpen && (
        <button type="button" className={`${styles.pill} ${place ? "" : styles.pillEmpty}`} onClick={toggle} aria-expanded={open}>
          <MapPin size={12} strokeWidth={2.5} />
          {place ?? "Add place"}
        </button>
      )}
      {open && shown && (
        <div className={styles.chips} role="group" aria-label="Where was this morning?">
          {shown.map((o) => (
            <button
              key={o}
              type="button"
              className={[styles.chip, o === place ? styles.chipCurrent : "", !place && o === suggestion ? styles.chipSuggested : ""].join(" ")}
              onClick={() => choose(o)}
              disabled={saving != null}
              aria-pressed={o === place}
            >
              {o === place && <Check size={12} strokeWidth={3} />}
              {saving === o ? "Saving…" : o}
            </button>
          ))}
          {adding ? (
            <form className={styles.newSpot} onSubmit={submitNew}>
              <input
                className={styles.input}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Spot name"
                aria-label="New spot name"
                autoFocus
              />
              <select className={styles.input} value={newKind} onChange={(e) => setNewKind(e.target.value)} aria-label="Kind of spot">
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
              <button type="submit" className={styles.chip} disabled={!newName.trim() || saving != null}>
                Add
              </button>
            </form>
          ) : (
            <button type="button" className={`${styles.chip} ${styles.chipNew}`} onClick={() => setAdding(true)} disabled={saving != null}>
              <Plus size={12} strokeWidth={2.5} />
              New spot
            </button>
          )}
        </div>
      )}
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
