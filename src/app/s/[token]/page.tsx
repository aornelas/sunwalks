import { isShareTokenActive } from "@/lib/share";
import { getDaysInRange, getAllCapturedDayKeys } from "@/lib/data";
import { computeStats } from "@/lib/stats";
import { env } from "@/lib/env";
import { addMonths, monthKey, todayDayKey } from "@/lib/dates";
import { CalendarApp } from "@/components/calendar/CalendarApp";

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const active = await isShareTokenActive(token);

  if (!active) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <p style={{ fontFamily: "var(--font-body)", color: "var(--color-neutral-700)", textAlign: "center" }}>
          This link isn&apos;t available anymore.
        </p>
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
