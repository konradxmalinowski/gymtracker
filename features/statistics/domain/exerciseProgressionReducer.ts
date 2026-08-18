import {
  estimated1RM,
  isRecordEligibleSetType,
  type OneRmFormula,
  type SetType,
} from '@/features/records';

import { bucketStartFor } from './dateRangeBuckets';
import type { BucketGranularity } from './statRange';

/**
 * `statistics -> records` is a deliberate, documented dependency edge
 * (ARCHITECTURE.md section 9.1, this phase's plan decision 4): a pure
 * domain-calculator reuse (`estimated1RM`/`isRecordEligibleSetType`), not a
 * write-service one, so it doesn't conflict with "statistics depends only on
 * read models, never on write services." `records` never imports
 * `statistics`, so this creates no cycle.
 */

export type ProgressionMetric = 'top_set' | 'e1rm' | 'volume';

/** One completed working set, as `SqliteStatisticsRepository.exerciseProgression` fetches it from `v_working_set` - raw, unreduced. */
export interface ExerciseWorkingSetPoint {
  localDate: string;
  weightKg: number | null;
  reps: number | null;
  setType: SetType;
  volumeKg: number;
}

export interface SeriesPoint {
  bucketStart: string;
  /**
   * `null` means "no eligible data this bucket" for `top_set`/`e1rm` - a
   * flat `0` would misread as "you lifted nothing at zero weight" on a
   * weight chart. `volume` metric never produces `null`: zero working-set
   * volume in a bucket is a real, meaningful zero.
   */
  value: number | null;
}

/**
 * Reduces raw working-set points into one `SeriesPoint` per bucket boundary,
 * per the metric selected. Table-driven-tested directly (Step 0 decision 6);
 * `SqliteStatisticsRepository.exerciseProgression` is the only caller.
 */
export function reduceExerciseProgression(
  points: readonly ExerciseWorkingSetPoint[],
  boundaries: readonly string[],
  bucket: BucketGranularity,
  metric: ProgressionMetric,
  formula: OneRmFormula,
): SeriesPoint[] {
  const byBucket = new Map<string, ExerciseWorkingSetPoint[]>();
  for (const point of points) {
    const bucketStart = bucketStartFor(point.localDate, bucket);
    const existing = byBucket.get(bucketStart);
    if (existing) {
      existing.push(point);
    } else {
      byBucket.set(bucketStart, [point]);
    }
  }

  return boundaries.map((bucketStart) => ({
    bucketStart,
    value: reduceBucket(byBucket.get(bucketStart) ?? [], metric, formula),
  }));
}

function reduceBucket(
  points: readonly ExerciseWorkingSetPoint[],
  metric: ProgressionMetric,
  formula: OneRmFormula,
): number | null {
  if (metric === 'volume') {
    return points.reduce((sum, point) => sum + point.volumeKg, 0);
  }

  const eligible = points.filter(
    (point): point is ExerciseWorkingSetPoint & { weightKg: number; reps: number } =>
      point.weightKg !== null && point.reps !== null && isRecordEligibleSetType(point.setType),
  );
  if (eligible.length === 0) {
    return null;
  }

  if (metric === 'top_set') {
    return Math.max(...eligible.map((point) => point.weightKg));
  }

  // metric === 'e1rm'
  const estimates = eligible
    .map((point) =>
      estimated1RM({ weightKg: point.weightKg, reps: point.reps, setType: point.setType }, formula),
    )
    .filter((value): value is number => value !== null);
  return estimates.length === 0 ? null : Math.max(...estimates);
}
