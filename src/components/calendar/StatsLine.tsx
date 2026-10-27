import type { Stats } from "@/lib/types";
import { RollingNumber } from "./RollingNumber";
import styles from "./StatsLine.module.css";

// Period first ("week 1/6") so all four fit one line at phone width even
// with three-digit counts; the web rail has room for "this/best week". The
// aria-labels spell out what the slash means.
export function StatsLine({ stats, animate }: { stats: Stats; animate?: boolean }) {
  return (
    <div className={styles.line}>
      <span><b><RollingNumber value={stats.total} animate={animate} /></b> sunwalks</span>
      <span aria-label={`${stats.thisWeek} this week, best ${stats.bestWeek}`}>
        week <b><RollingNumber value={stats.thisWeek} animate={animate} />/<RollingNumber value={stats.bestWeek} animate={animate} /></b>
      </span>
      <span aria-label={`${stats.thisMonth} this month, best ${stats.bestMonth}`}>
        month <b><RollingNumber value={stats.thisMonth} animate={animate} />/<RollingNumber value={stats.bestMonth} animate={animate} /></b>
      </span>
      <span aria-label={`${stats.thisYear} this year, best ${stats.bestYear}`}>
        year <b><RollingNumber value={stats.thisYear} animate={animate} />/<RollingNumber value={stats.bestYear} animate={animate} /></b>
      </span>
    </div>
  );
}
