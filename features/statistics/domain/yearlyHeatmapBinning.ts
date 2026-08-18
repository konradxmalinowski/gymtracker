import { formatLocalDate, isLeapYear, parseLocalDate } from './localDate';

export type HeatmapLevel = 0 | 1 | 2 | 3 | 4;

export interface DayIntensity {
  localDate: string;
  volumeKg: number;
  level: HeatmapLevel;
}

/** One raw day's volume, as `SqliteStatisticsRepository.yearlyHeatmap` fetches it - only days with at least one working set. */
export interface DailyVolumePoint {
  localDate: string;
  volumeKg: number;
}

/**
 * Fills every day of `year` (365 or 366 rows) and quantile-bins each
 * trained day into a level 1-4 - level 0 is every day with zero volume,
 * including days outside `rows` entirely. Step 0 decision 3.
 *
 * Binning is quartile-based over the year's *trained* days only (untrained
 * days don't skew the thresholds toward 0): level 1 = the lowest quartile of
 * trained-day volumes, level 4 = the top quartile. A year with fewer than 4
 * trained days still bins correctly - every trained day gets at least level
 * 1, and ties at a quartile boundary resolve to the higher level (matches
 * the intuitive "at least this much volume" reading of a boundary value).
 */
export function computeYearlyHeatmap(
  rows: readonly DailyVolumePoint[],
  year: number,
): DayIntensity[] {
  const volumeByDate = new Map(rows.map((row) => [row.localDate, row.volumeKg]));
  const trainedVolumes = rows.map((row) => row.volumeKg).filter((volume) => volume > 0);
  const thresholds = quartileThresholds(trainedVolumes);

  const days: DayIntensity[] = [];
  const daysInYear = isLeapYear(year) ? 366 : 365;
  let cursor = parseLocalDate(`${year}-01-01`);
  for (let i = 0; i < daysInYear; i += 1) {
    const localDate = formatLocalDate(cursor);
    const volumeKg = volumeByDate.get(localDate) ?? 0;
    days.push({ localDate, volumeKg, level: levelFor(volumeKg, thresholds) });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

interface QuartileThresholds {
  q1: number;
  q2: number;
  q3: number;
}

function quartileThresholds(sortedAscendingSource: readonly number[]): QuartileThresholds {
  const sorted = [...sortedAscendingSource].sort((a, b) => a - b);
  return {
    q1: quantile(sorted, 0.25),
    q2: quantile(sorted, 0.5),
    q3: quantile(sorted, 0.75),
  };
}

/** Linear-interpolation quantile (same method as `Array.prototype.toSorted` + the common "R-7" definition) - `0` for an empty input, guarded by every caller. */
function quantile(sortedAscending: readonly number[], p: number): number {
  if (sortedAscending.length === 0) {
    return 0;
  }
  if (sortedAscending.length === 1) {
    return sortedAscending[0]!;
  }
  const index = p * (sortedAscending.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sortedAscending[lower]!;
  }
  const weight = index - lower;
  return sortedAscending[lower]! * (1 - weight) + sortedAscending[upper]! * weight;
}

function levelFor(volumeKg: number, thresholds: QuartileThresholds): HeatmapLevel {
  if (volumeKg <= 0) {
    return 0;
  }
  if (volumeKg <= thresholds.q1) {
    return 1;
  }
  if (volumeKg <= thresholds.q2) {
    return 2;
  }
  if (volumeKg <= thresholds.q3) {
    return 3;
  }
  return 4;
}
