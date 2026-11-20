import { formatLocalDate, isLeapYear, parseLocalDate } from './localDate';

/** `0` = no entry logged that day, `1` = red (poor), `2` = yellow (okay), `3` = green (great) - a fixed 3-tier scale, unlike `yearlyHeatmapBinning.ts`'s quantile-derived 4-tier one, since sleep quality has an obvious absolute threshold a lifter already knows rather than one relative to their own year. */
export type SleepLevel = 0 | 1 | 2 | 3;

export interface DaySleep {
  localDate: string;
  /** Hours slept, or `null` for a day with no logged entry. */
  hours: number | null;
  level: SleepLevel;
}

/** One raw day's sleep, as `SqliteStatisticsRepository.sleepHeatmap` fetches it - only days with a logged `sleep_hours` entry. */
export interface DailySleepPoint {
  localDate: string;
  hours: number;
}

/** Below this many hours bins to level 1 (red). */
const RED_THRESHOLD_HOURS = 6;
/** At or above this many hours bins to level 3 (green); between the two thresholds bins to level 2 (yellow). */
const GREEN_THRESHOLD_HOURS = 8;

/**
 * Fills every day of `year` (365 or 366 rows) and bins each logged night
 * into a fixed 3-tier scale - green >= 8h, yellow [6, 8), red < 6h - the
 * same GitHub-contribution-graph shape `computeYearlyHeatmap` already
 * establishes for training volume, reused here with absolute rather than
 * quantile thresholds (Step 0/user brief: a lifter already knows what "good
 * sleep" means in hours, so binning relative to their own year like the
 * training heatmap would be misleading here).
 */
export function computeSleepHeatmap(rows: readonly DailySleepPoint[], year: number): DaySleep[] {
  const hoursByDate = new Map(rows.map((row) => [row.localDate, row.hours]));

  const days: DaySleep[] = [];
  const daysInYear = isLeapYear(year) ? 366 : 365;
  const cursor = parseLocalDate(`${year}-01-01`);
  for (let i = 0; i < daysInYear; i += 1) {
    const localDate = formatLocalDate(cursor);
    const hours = hoursByDate.get(localDate) ?? null;
    days.push({ localDate, hours, level: levelFor(hours) });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function levelFor(hours: number | null): SleepLevel {
  if (hours === null) {
    return 0;
  }
  if (hours < RED_THRESHOLD_HOURS) {
    return 1;
  }
  if (hours < GREEN_THRESHOLD_HOURS) {
    return 2;
  }
  return 3;
}
