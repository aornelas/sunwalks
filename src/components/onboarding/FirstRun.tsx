"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createOwnerApi } from "@/lib/api-client";
import { usePickerImport } from "@/hooks/usePickerImport";
import styles from "./FirstRun.module.css";

const ILLUSTRATION = [
  "/seed-photos/sq/1.png",
  null,
  "/seed-photos/sq/5.png",
  null,
  "/seed-photos/sq/9.png",
  null,
] as const;

export function FirstRun() {
  const router = useRouter();
  const api = useMemo(() => createOwnerApi(), []);
  const { state, photosAdded, error, manualPickerUri, start } = usePickerImport(api);

  useEffect(() => {
    if (state === "done") {
      router.push("/");
      router.refresh();
    }
  }, [state, router]);

  const buttonLabel =
    state === "waiting"
      ? "Waiting for you in Google Photos…"
      : state === "importing"
        ? "Adding your photos…"
        : state === "done"
          ? `Added ${photosAdded ?? 0} photos`
          : "Choose photos";

  return (
    <div className={styles.page}>
      <div className={styles.illustration}>
        {ILLUSTRATION.map((src, i) =>
          src ? (
            <div key={i} className={styles.square}>
              <img src={src} alt="" />
            </div>
          ) : (
            <div key={i} className={styles.square} />
          ),
        )}
      </div>

      <h1 className={styles.headline}>One square for every morning you were out there.</h1>
      <p className={styles.body}>
        Pick your sunrise photos from Google Photos — select as many as you want at once. Add
        more anytime; there&apos;s nothing to log.
      </p>

      <div className={styles.spacer} />

      {error && <p className={styles.empty}>{error}</p>}
      {state === "waiting" && !manualPickerUri && (
        <p className={styles.loading}>A new tab opened to Google Photos — come back here once you&apos;re done picking.</p>
      )}
      {manualPickerUri && (
        <p className={styles.loading}>
          Your browser blocked the popup —{" "}
          <a href={manualPickerUri} target="_blank" rel="noopener noreferrer">
            open Google Photos manually
          </a>
          , then come back here.
        </p>
      )}

      <button
        type="button"
        className={styles.cta}
        onClick={start}
        disabled={state === "waiting" || state === "importing" || state === "done"}
      >
        {buttonLabel}
      </button>
      <p className={styles.footnote}>Read-only access. Photos stay in your account.</p>
    </div>
  );
}
