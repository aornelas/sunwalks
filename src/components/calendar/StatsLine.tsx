import type { Stats } from "@/lib/types";
import styles from "./StatsLine.module.css";

export function StatsLine({ stats }: { stats: Stats }) {
  return (
    <div className={styles.line}>
      <span><b>{stats.total}</b> sunrises</span>
      <span><b>{stats.last7}</b> this week</span>
      <span><b>{stats.last30}</b> this month</span>
      <span><b>{stats.avgPerWeek}</b> a week</span>
    </div>
  );
}
