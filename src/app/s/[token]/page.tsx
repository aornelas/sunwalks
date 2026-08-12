import { isShareTokenActive } from "@/lib/share";
import { getDaysInRange, getAllCapturedDayKeys } from "@/lib/data";
import { computeStats } from "@/lib/stats";
import { env } from "@/lib/env";
import { addMonths, monthKey, todayDayKey } from "@/lib/dates";
import { CalendarApp } from "@/components/calendar/CalendarApp";
import styles from "./unavailable.module.css";

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
