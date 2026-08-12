import { redirect } from "next/navigation";
import { getOwnerAccount } from "@/lib/owner";
import { getDaysInRange, getAllCapturedDayKeys } from "@/lib/data";
import { computeStats } from "@/lib/stats";
import { getLatestSyncLog } from "@/lib/ingest";
import { env } from "@/lib/env";
import { addMonths, monthKey, todayDayKey } from "@/lib/dates";
import { CalendarApp } from "@/components/calendar/CalendarApp";
import type { AccountInfo, SyncInfo } from "@/lib/types";

// Reads live owner/session state on every request — must never be statically cached.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const account = await getOwnerAccount();
  if (!account) redirect("/login");
  if (!account.albumId) redirect("/onboarding");

  const today = todayDayKey(env.timezone);
  const windowStart = `${addMonths(monthKey(today), -2)}-01`;

  const [initialDays, initialStats, initialDayKeys, syncLog] = await Promise.all([
    getDaysInRange(windowStart, today),
    computeStats(),
    getAllCapturedDayKeys(),
    getLatestSyncLog(),
  ]);

  const accountInfo: AccountInfo = {
    email: account.email,
    albumId: account.albumId,
    albumName: account.albumName,
    autoSync: account.autoSync,
  };

  const syncInfo: SyncInfo = syncLog
    ? {
        lastSyncedAt: syncLog.finishedAt?.toISOString() ?? null,
        status: syncLog.status,
        error: syncLog.error,
      }
    : { lastSyncedAt: null, status: "never" };

  return (
    <CalendarApp
      readOnly={false}
      timezone={env.timezone}
      today={today}
      initialDays={initialDays}
      initialStats={initialStats}
      initialDayKeys={initialDayKeys}
      account={accountInfo}
      syncInfo={syncInfo}
    />
  );
}
