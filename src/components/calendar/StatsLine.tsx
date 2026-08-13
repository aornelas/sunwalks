import type { Stats } from "@/lib/types";
import { RollingNumber } from "./RollingNumber";
import styles from "./StatsLine.module.css";

export function StatsLine({ stats, animate }: { stats: Stats; animate?: boolean }) {
  return (
    <div className={styles.line}>
      <span><b><RollingNumber value={stats.total} animate={animate} /></b> sunrises</span>
      <span><b><RollingNumber value={stats.last7} animate={animate} /></b> this week</span>
      <span><b><RollingNumber value={stats.last30} animate={animate} /></b> this month</span>
      <span><b><RollingNumber value={stats.avgPerWeek} animate={animate} /></b> a week</span>
    </div>
  );
}
