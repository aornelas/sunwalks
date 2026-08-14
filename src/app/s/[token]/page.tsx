import type { Metadata } from "next";
import { isShareTokenActive } from "@/lib/share";
import { getDaysInRange, getAllCapturedDayKeys } from "@/lib/data";
import { computeStats } from "@/lib/stats";
import { env } from "@/lib/env";
import { addMonths, monthKey, todayDayKey } from "@/lib/dates";
import { CalendarApp } from "@/components/calendar/CalendarApp";
import styles from "./unavailable.module.css";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  // Overrides the root layout's /manifest.json so installing from this page
  // (Android/Chrome "Add to Home Screen") opens straight back into this
  // share link instead of the login-gated app shell.
  return { manifest: `/api/s/${token}/manifest` };
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const active = await isShareTokenActive(token);

  if (!active) {
    return (
      <div className={styles.page}>
        <p className={styles.message}>This link isn&apos;t available anymore.</p>
      </div>
    );
  }

  const today = todayDayKey(env.timezone);
  const windowStart = `${addMonths(monthKey(today), -2)}-01`;

  const [initialDays, initialStats, initialDayKeys] = await Promise.all([
    getDaysInRange(windowStart, today),
    computeStats(),
    getAllCapturedDayKeys(),
  ]);

  return (
    <CalendarApp
      readOnly
      shareToken={token}
      timezone={env.timezone}
      today={today}
      initialDays={initialDays}
      initialStats={initialStats}
      initialDayKeys={initialDayKeys}
    />
  );
}
