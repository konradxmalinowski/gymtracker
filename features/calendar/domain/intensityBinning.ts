export type HeatmapLevel = 0 | 1 | 2 | 3 | 4;

/** One trained day's total volume, as `CalendarRepository.yearOverview`/`monthOverview` supply it - deliberately the same two-field shape as `CalendarYearDayDto`, so a repository result passes straight in with no per-field mapping. */
export interface DailyVolumePoint {
  localDate: string;
  totalVolumeKg: number;
}

export interface DayIntensity extends DailyVolumePoint {
  level: HeatmapLevel;
}

/**
 * Quartile-bins each day in `allLocalDates` into an intensity level 0-4,
 * given `rows` - the subset of those days that were actually trained
 * (`totalVolumeKg > 0`). A deliberate, small duplication of
 * `features/statistics/domain/yearlyHeatmapBinning.ts`'s quartile math (Step
 * 0 decision 3 of `plans/2026-08-19-p12-calendar.md`) - `calendar` may not
 * depend on `statistics` (no such edge in ARCHITECTURE.md section 9.1).
 *
 * Generalized beyond that file's own year-shaped precedent: this function
 * takes an explicit `allLocalDates` list rather than a `year` number, so the
 * exact same quartile logic serves both the month view and the year view
 * with no second binning function - the caller gap-fills first, via
 * `generateMonthGrid` (current-month cells only) for a month or
 * `generateDateRange('${year}-01-01', '${year}-12-31')` for a year, then
 * calls this once over that date list.
 *
 * Binning is quartile-based over *trained* days only (folding in untrained
 * days would skew every threshold toward 0): level 1 = the lowest quartile
 * of trained-day volumes, level 4 = the top quartile, ties at a quartile
 * boundary resolve to the higher level (matches the intuitive "at least this
 * much volume" reading of a boundary value). Fewer than 4 trained days in
 * range still bins correctly - every trained day gets at least level 1.
 */
export function computeDayIntensities(
  rows: readonly DailyVolumePoint[],
  allLocalDates: readonly string[],
): DayIntensity[] {
  const volumeByDate = new Map(rows.map((row) => [row.localDate, row.totalVolumeKg]));
  const trainedVolumes = rows.map((row) => row.totalVolumeKg).filter((volume) => volume > 0);
  const thresholds = quartileThresholds(trainedVolumes);

  return allLocalDates.map((localDate) => {
    const totalVolumeKg = volumeByDate.get(localDate) ?? 0;
    return { localDate, totalVolumeKg, level: levelFor(totalVolumeKg, thresholds) };
  });
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

/** Linear-interpolation quantile (same method as the common "R-7" definition) - `0` for an empty input, guarded by every caller. */
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

function levelFor(totalVolumeKg: number, thresholds: QuartileThresholds): HeatmapLevel {
  if (totalVolumeKg <= 0) {
    return 0;
  }
  if (totalVolumeKg <= thresholds.q1) {
    return 1;
  }
  if (totalVolumeKg <= thresholds.q2) {
    return 2;
  }
  if (totalVolumeKg <= thresholds.q3) {
    return 3;
  }
  return 4;
}
