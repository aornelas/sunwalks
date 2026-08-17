import { redirect } from "next/navigation";
import { getOwnerAccount } from "@/lib/owner";
import { getDaysInRange, getAllCapturedDayKeys } from "@/lib/data";
import { computeStats } from "@/lib/stats";
import { env } from "@/lib/env";
import { addMonths, monthKey, todayDayKey } from "@/lib/dates";
import { CalendarApp } from "@/components/calendar/CalendarApp";
import type { AccountInfo } from "@/lib/types";

// Reads live owner/session state on every request — must never be statically cached.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const account = await getOwnerAccount();
  if (!account) redirect("/login");
  if (!account.lastPickedAt) redirect("/onboarding");

  const today = todayDayKey(env.timezone);
  const windowStart = `${addMonths(monthKey(today), -2)}-01`;

  // Planning data is deliberately NOT fetched here: it can involve a live
  // Open-Meteo call (see lib/planning.ts's cache-miss path), and blocking
  // first paint on a third-party network request is worse than the entry
  // row briefly reading "Checking forecast…" — CalendarApp fetches it
  // itself once mounted.
  const [initialDays, initialStats, initialDayKeys] = await Promise.all([
    getDaysInRange(windowStart, today),
    computeStats(),
    getAllCapturedDayKeys(),
  ]);

  const accountInfo: AccountInfo = {
    email: account.email,
    lastPickedAt: account.lastPickedAt.toISOString(),
  };

  return (
    <CalendarApp
      readOnly={false}
      timezone={env.timezone}
      today={today}
      initialDays={initialDays}
      initialStats={initialStats}
      initialDayKeys={initialDayKeys}
      account={accountInfo}
    />
  );
}
