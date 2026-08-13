"use client";

import { useCallback, useRef, useState } from "react";
import type { CalendarApi } from "@/lib/api-client";

export type PickerImportState = "idle" | "waiting" | "importing" | "done" | "error";

export interface PickerImportResult {
  state: PickerImportState;
  photosAdded: number | null;
  error: string | null;
  /** Set only while `state === "waiting"` and the popup appears to have been blocked. */
  manualPickerUri: string | null;
  /** Opens the Google Photos picker in a new tab and imports whatever gets picked. */
  start(): Promise<void>;
  reset(): void;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Drives the Picker API's inherently multi-step flow: create a session,
 * open Google's hosted picker UI in a new tab (the owner selects — natively
 * supports multi-select, up to 2000 items — one photo or hundreds at once),
 * poll our backend until they're done, then import. Per the note atop
 * ingest.ts, this can't run unattended, so every call to start() is a
 * deliberate, user-present action.
 *
 * IMPORTANT: window.open is called WITHOUT noopener/noreferrer on purpose.
 * Either of those makes window.open() always return null (per spec — the
 * new browsing context is created but not exposed to script), which makes
 * "was this blocked?" undetectable. This tab needs that reference both to
 * detect a real block and to close the picker tab once import finishes —
 * so this is one of the few legitimate cases for skipping noopener.
 */
export function usePickerImport(api: CalendarApi): PickerImportResult {
  const [state, setState] = useState<PickerImportState>("idle");
  const [photosAdded, setPhotosAdded] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualPickerUri, setManualPickerUri] = useState<string | null>(null);
  const runIdRef = useRef(0);

  const reset = useCallback(() => {
    setState("idle");
    setPhotosAdded(null);
    setError(null);
    setManualPickerUri(null);
  }, []);

  const start = useCallback(async () => {
    if (!api.createPickerSession || !api.pollPickerSession || !api.importPickerSession) return;
    const runId = ++runIdRef.current;
    setState("waiting");
    setError(null);
    setPhotosAdded(null);
    setManualPickerUri(null);

    try {
      const session = await api.createPickerSession();
      const popup = window.open(session.pickerUri, "_blank");
      if (!popup || popup.closed) {
        // Genuinely blocked (rare without noopener) — offer a manual link
        // instead of navigating this tab away, which would kill the poll
        // loop below.
        setManualPickerUri(session.pickerUri);
      }

      const deadline = Date.now() + session.timeoutMs;
      let ready = false;
      let cancelled = false;
      while (Date.now() < deadline) {
        await sleep(session.pollIntervalMs);
        if (runIdRef.current !== runId) return; // superseded by a newer call
        const { ready: r } = await api.pollPickerSession(session.sessionId);
        if (r) {
          ready = true;
          break;
        }
        // Checked after polling (not before) so a tab closed right after a
        // successful pick can't race a "cancelled" verdict ahead of the
        // poll that would've reported ready — see the bug this fixed:
        // closing the picker tab left the button spinning, disabled, for
        // the full session timeout with zero feedback.
        if (popup && popup.closed) {
          cancelled = true;
          break;
        }
      }
      if (runIdRef.current !== runId) return;
      if (cancelled) {
        setState("error");
        setError("Cancelled — you closed the Google Photos tab before finishing.");
        return;
      }
      if (!ready) {
        setState("error");
        setError("Timed out waiting for you to finish picking in Google Photos.");
        return;
      }

      setState("importing");
      const result = await api.importPickerSession(session.sessionId);
      if (runIdRef.current !== runId) return;
      if (!result.ok) {
        setState("error");
        setError(result.error ?? "Import failed");
        return;
      }
      popup?.close();
      setPhotosAdded(result.photosAdded ?? 0);
      setState("done");
    } catch (err) {
      if (runIdRef.current !== runId) return;
      setState("error");
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }, [api]);

  return { state, photosAdded, error, manualPickerUri, start, reset };
}
