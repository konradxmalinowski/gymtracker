import type { SqlExecutor } from '@/repositories/contracts/database';
import type { EntityId } from '@/repositories/contracts/repository';

import type { ProgressionMetric, SeriesPoint } from '../domain/exerciseProgressionReducer';
import type { BucketGranularity } from '../domain/statRange';
import type { DayIntensity } from '../domain/yearlyHeatmapBinning';

export interface TimeBucket {
  /** Inclusive start of the bucket (`YYYY-MM-DD`) - a day, an ISO week's Monday, or a month's 1st, per the `bucket` param. */
  bucketStart: string;
  value: number;
}

export interface MuscleVolumeSlice {
  /** `exercise.body_part` (`'upper'|'lower'|'core'|'arms'|'back'|'shoulders'|'legs'`), or `'other'` for a custom exercise with no muscle selected (Step 0 decision 2). */
  bodyPart: string;
  volumeKg: number;
}

export type { ProgressionMetric, SeriesPoint } from '../domain/exerciseProgressionReducer';
export type { DayIntensity, HeatmapLevel } from '../domain/yearlyHeatmapBinning';

/**
 * `StatisticsRepository` (read model, feature: `statistics`) - returns DTOs
 * from SQL aggregates only, per ARCHITECTURE.md section 8.3's own framing
 * for this repository ("no statistics query loads an entity"). No
 * accompanying service, same "flat DTOs, nothing to validate" shape as
 * `ExerciseHistoryRepository`/`HomeDashboardRepository`.
 *
 * Deliberately ships 6 of section 8.3's original 8 methods -
 * `weeklySummary()`/`streak()` are Home's permanently (this phase's plan,
 * decision 4; resolves ADR-0019's open migration note). Every date-bounded
 * method takes concrete `[localDateFrom, localDateTo]` + `bucket` rather
 * than a `StatRange` enum (plan decision 5) - range resolution is a hooks-
 * layer concern (`features/statistics/domain/statRange.ts`), keeping this
 * repository as settings/UI-free as every other one in the codebase.
 */
export interface StatisticsRepository {
  /** Total working-set volume (kg) per bucket, gap-filled to 0 for buckets with no completed working sets. */
  volumeByPeriod(
    localDateFrom: string,
    localDateTo: string,
    bucket: BucketGranularity,
    tx?: SqlExecutor,
  ): Promise<TimeBucket[]>;

  /** Completed session count per bucket, gap-filled to 0. */
  sessionFrequency(
    localDateFrom: string,
    localDateTo: string,
    bucket: BucketGranularity,
    tx?: SqlExecutor,
  ): Promise<TimeBucket[]>;

  /** Average completed-session duration (seconds) per bucket, gap-filled to 0 for buckets with no sessions. */
  durationTrend(
    localDateFrom: string,
    localDateTo: string,
    bucket: BucketGranularity,
    tx?: SqlExecutor,
  ): Promise<TimeBucket[]>;

  /** Working-set volume grouped by `exercise.body_part`, primary muscle only (Step 0 decision 2), ordered by volume descending. Only body parts with at least one working set appear. */
  muscleGroupVolume(
    localDateFrom: string,
    localDateTo: string,
    tx?: SqlExecutor,
  ): Promise<MuscleVolumeSlice[]>;

  /**
   * One `SeriesPoint` per bucket boundary for a single exercise, reduced per
   * `metric` (plan decision 6). For `metric === 'e1rm'`, the formula is
   * `oneRm.formula` read from settings internally - the same "one module
   * resolves this setting" precedent `SqlitePersonalRecordRepository`
   * already establishes (ADR-0015), so no caller needs settings-schema
   * knowledge of its own.
   */
  exerciseProgression(
    exerciseId: EntityId,
    localDateFrom: string,
    localDateTo: string,
    bucket: BucketGranularity,
    metric: ProgressionMetric,
    tx?: SqlExecutor,
  ): Promise<SeriesPoint[]>;

  /** Every day of `year`, gap-filled and quantile-binned per Step 0 decision 3. */
  yearlyHeatmap(year: number, tx?: SqlExecutor): Promise<DayIntensity[]>;
}
