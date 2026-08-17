import type { Stats } from "@/lib/types";
import { RollingNumber } from "./RollingNumber";
import styles from "./StatsLine.module.css";

export function StatsLine({ stats, animate }: { stats: Stats; animate?: boolean }) {
  return (
    <div className={styles.line}>
      <span><b><RollingNumber value={stats.total} animate={animate} /></b> sunwalks</span>
      <span>
        <b><RollingNumber value={stats.thisWeek} animate={animate} />/<RollingNumber value={stats.bestWeek} animate={animate} /></b> this/best week
      </span>
      <span>
        <b><RollingNumber value={stats.thisMonth} animate={animate} />/<RollingNumber value={stats.bestMonth} animate={animate} /></b> this/best month
      </span>
      <span>
        <b><RollingNumber value={stats.thisYear} animate={animate} />/<RollingNumber value={stats.bestYear} animate={animate} /></b> this/best year
      </span>
    </div>
  );
}
