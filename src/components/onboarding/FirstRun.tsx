"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import type { AlbumInfo } from "@/lib/types";
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
  const [albums, setAlbums] = useState<AlbumInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/albums")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setAlbums(data.albums);
        if (data.albums.length > 0) setSelectedId(data.albums[0].id);
      })
      .catch(() => setError("Couldn't load your Google Photos albums."));
  }, []);

  const handleUseAlbum = async () => {
    const album = albums?.find((a) => a.id === selectedId);
    if (!album) return;
    setSubmitting(true);
    await fetch("/api/album", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ albumId: album.id, albumName: album.title }),
    });
    router.push("/");
    router.refresh();
  };

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
        Point this at the album you already keep. It picks up new photos once a day, reads the
        date off each one, and fills in the square. Nothing to log.
      </p>

      <span className={styles.kicker}>YOUR ALBUMS</span>
      <div className={styles.albumList}>
        {error && <p className={styles.empty}>{error}</p>}
        {!error && !albums && <p className={styles.loading}>Loading your albums…</p>}
        {!error && albums?.length === 0 && (
          <p className={styles.empty}>No albums found on this Google account.</p>
        )}
        {albums?.map((album) => (
          <button
            key={album.id}
            type="button"
            className={`${styles.albumRow} ${selectedId === album.id ? styles.albumSelected : ""}`}
            onClick={() => setSelectedId(album.id)}
          >
            <div className={styles.cover}>{album.coverUrl && <img src={album.coverUrl} alt="" />}</div>
            <div className={styles.albumText}>
              <div className={styles.albumName}>{album.title}</div>
              <div className={styles.albumSubtitle}>{album.photoCount} photos · read-only</div>
            </div>
            {selectedId === album.id && (
              <span className={styles.check}>
                <Check size={18} strokeWidth={2.75} />
              </span>
            )}
          </button>
        ))}
      </div>

      <div className={styles.spacer} />

      <button type="button" className={styles.cta} onClick={handleUseAlbum} disabled={!selectedId || submitting}>
        {submitting ? "Setting up…" : "Use this album"}
      </button>
      <p className={styles.footnote}>Read-only access. Photos stay in your account.</p>
    </div>
  );
}
