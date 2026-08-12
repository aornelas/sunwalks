import styles from "./page.module.css";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.wordmark}>Sunrise</h1>
        <p className={styles.tagline}>
          One square for every morning you were out there. Sign in with the Google account that
          holds your sunrise album.
        </p>
        {error && <div className={styles.error}>{error}</div>}
        <a className={styles.button} href="/api/auth/google/login">
          Continue with Google
        </a>
        <p className={styles.note}>Read-only access. Photos stay in your account.</p>
      </div>
    </div>
  );
}
