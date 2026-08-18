import { brzyckiFormula, epleyFormula, type OneRmFormula } from '@/features/records';
import type { DatabaseContext, SqlExecutor } from '@/repositories/contracts/database';
import type { EntityId } from '@/repositories/contracts/repository';
import type { SettingsRepository } from '@/repositories/settings';

import {
  aggregateDailyRowsIntoBuckets,
  generateBucketBoundaries,
} from '../domain/dateRangeBuckets';
import {
  reduceExerciseProgression,
  type ExerciseWorkingSetPoint,
  type ProgressionMetric,
  type SeriesPoint,
} from '../domain/exerciseProgressionReducer';
import type { BucketGranularity } from '../domain/statRange';
import { computeYearlyHeatmap, type DayIntensity } from '../domain/yearlyHeatmapBinning';
import type { MuscleVolumeSlice, StatisticsRepository, TimeBucket } from './StatisticsRepository';

export interface StatisticsRepositoryDependencies {
  db: DatabaseContext;
  settings: SettingsRepository;
}

interface DailyVolumeRow {
  local_date: string;
  volume_kg: number | null;
}

interface DailySessionCountRow {
  local_date: string;
  session_count: number;
}

interface DailyDurationRow {
  local_date: string;
  total_duration_seconds: number | null;
  session_count: number;
}

interface MuscleVolumeRow {
  body_part: string;
  volume_kg: number | null;
}

interface WorkingSetRow {
  local_date: string;
  weight_kg: number | null;
  reps: number | null;
  set_type: ExerciseWorkingSetPoint['setType'];
  volume_kg: number;
}

/**
 * SQLite implementation of `StatisticsRepository`. Read-only, so - mirroring
 * `SqliteHomeDashboardRepository`/`SqliteExerciseHistoryRepository` - it
 * takes only `db`, no `BaseSqliteRepository`. Every query filters
 * `deleted_at IS NULL`/`status = 'completed'` on `workout_set`/
 * `workout_session` (`v_working_set`/`v_session_summary` already bake this
 * in). `muscleGroupVolume`'s `JOIN exercise` is deliberately NOT also
 * filtered on `exercise.deleted_at` - a soft-deleted exercise (hidden from
 * the library, but never hard-deleted while any session still references it
 * via `ON DELETE RESTRICT`) keeps its historical volume attribution;
 * excluding it would silently understate a body part's true trained volume
 * for any exercise later removed from the catalog.
 *
 * Bucketing (day -> week/month) never happens in SQL - every method fetches
 * day-level SQL aggregates and re-buckets in JS via
 * `features/statistics/domain/dateRangeBuckets.ts`, per this phase's plan
 * decision 5/6 and that file's own header comment.
 */
export class SqliteStatisticsRepository implements StatisticsRepository {
  constructor(private readonly deps: StatisticsRepositoryDependencies) {}

  async volumeByPeriod(
    localDateFrom: string,
    localDateTo: string,
    bucket: BucketGranularity,
    tx?: SqlExecutor,
  ): Promise<TimeBucket[]> {
    const executor = tx ?? this.deps.db;
    const rows = await executor.select<DailyVolumeRow>(
      `SELECT local_date, SUM(volume_kg) AS volume_kg
       FROM v_working_set
       WHERE local_date BETWEEN ? AND ?
       GROUP BY local_date`,
      [localDateFrom, localDateTo],
    );
    const boundaries = generateBucketBoundaries(localDateFrom, localDateTo, bucket);
    return aggregateDailyRowsIntoBuckets(
      rows.map((row) => ({ localDate: row.local_date, volumeKg: row.volume_kg ?? 0 })),
      boundaries,
      bucket,
      (rowsInBucket) => rowsInBucket.reduce((sum, row) => sum + row.volumeKg, 0),
    );
  }

  async sessionFrequency(
    localDateFrom: string,
    localDateTo: string,
    bucket: BucketGranularity,
    tx?: SqlExecutor,
  ): Promise<TimeBucket[]> {
    const executor = tx ?? this.deps.db;
    const rows = await executor.select<DailySessionCountRow>(
      `SELECT local_date, COUNT(*) AS session_count
       FROM workout_session
       WHERE status = 'completed' AND deleted_at IS NULL AND local_date BETWEEN ? AND ?
       GROUP BY local_date`,
      [localDateFrom, localDateTo],
    );
    const boundaries = generateBucketBoundaries(localDateFrom, localDateTo, bucket);
    return aggregateDailyRowsIntoBuckets(
      rows.map((row) => ({ localDate: row.local_date, sessionCount: row.session_count })),
      boundaries,
      bucket,
      (rowsInBucket) => rowsInBucket.reduce((sum, row) => sum + row.sessionCount, 0),
    );
  }

  async durationTrend(
    localDateFrom: string,
    localDateTo: string,
    bucket: BucketGranularity,
    tx?: SqlExecutor,
  ): Promise<TimeBucket[]> {
    const executor = tx ?? this.deps.db;
    const rows = await executor.select<DailyDurationRow>(
      `SELECT local_date,
              SUM(duration_seconds) AS total_duration_seconds,
              COUNT(*) AS session_count
       FROM workout_session
       WHERE status = 'completed' AND deleted_at IS NULL AND local_date BETWEEN ? AND ?
       GROUP BY local_date`,
      [localDateFrom, localDateTo],
    );
    const boundaries = generateBucketBoundaries(localDateFrom, localDateTo, bucket);
    return aggregateDailyRowsIntoBuckets(
      rows.map((row) => ({
        localDate: row.local_date,
        totalDurationSeconds: row.total_duration_seconds ?? 0,
        sessionCount: row.session_count,
      })),
      boundaries,
      bucket,
      (rowsInBucket) => {
        const totalDuration = rowsInBucket.reduce((sum, row) => sum + row.totalDurationSeconds, 0);
        const totalSessions = rowsInBucket.reduce((sum, row) => sum + row.sessionCount, 0);
        return totalSessions === 0 ? 0 : Math.round(totalDuration / totalSessions);
      },
    );
  }

  async muscleGroupVolume(
    localDateFrom: string,
    localDateTo: string,
    tx?: SqlExecutor,
  ): Promise<MuscleVolumeSlice[]> {
    const executor = tx ?? this.deps.db;
    const rows = await executor.select<MuscleVolumeRow>(
      `SELECT COALESCE(e.body_part, 'other') AS body_part, SUM(vs.volume_kg) AS volume_kg
       FROM v_working_set vs
       JOIN exercise e ON e.id = vs.exercise_id
       WHERE vs.local_date BETWEEN ? AND ?
       GROUP BY COALESCE(e.body_part, 'other')
       ORDER BY volume_kg DESC`,
      [localDateFrom, localDateTo],
    );
    return rows.map((row) => ({ bodyPart: row.body_part, volumeKg: row.volume_kg ?? 0 }));
  }

  async exerciseProgression(
    exerciseId: EntityId,
    localDateFrom: string,
    localDateTo: string,
    bucket: BucketGranularity,
    metric: ProgressionMetric,
    tx?: SqlExecutor,
  ): Promise<SeriesPoint[]> {
    const executor = tx ?? this.deps.db;
    const [rows, formula] = await Promise.all([
      executor.select<WorkingSetRow>(
        `SELECT local_date, weight_kg, reps, set_type, volume_kg
         FROM v_working_set
         WHERE exercise_id = ? AND local_date BETWEEN ? AND ?
         ORDER BY performed_at ASC`,
        [exerciseId, localDateFrom, localDateTo],
      ),
      metric === 'e1rm' ? this.resolveOneRmFormula(tx) : Promise.resolve(epleyFormula),
    ]);
    const points: ExerciseWorkingSetPoint[] = rows.map((row) => ({
      localDate: row.local_date,
      weightKg: row.weight_kg,
      reps: row.reps,
      setType: row.set_type,
      volumeKg: row.volume_kg,
    }));
    const boundaries = generateBucketBoundaries(localDateFrom, localDateTo, bucket);
    return reduceExerciseProgression(points, boundaries, bucket, metric, formula);
  }

  async yearlyHeatmap(year: number, tx?: SqlExecutor): Promise<DayIntensity[]> {
    const executor = tx ?? this.deps.db;
    const rows = await executor.select<DailyVolumeRow>(
      `SELECT local_date, SUM(volume_kg) AS volume_kg
       FROM v_working_set
       WHERE local_date BETWEEN ? AND ?
       GROUP BY local_date`,
      [`${year}-01-01`, `${year}-12-31`],
    );
    return computeYearlyHeatmap(
      rows.map((row) => ({ localDate: row.local_date, volumeKg: row.volume_kg ?? 0 })),
      year,
    );
  }

  /** Same `oneRm.formula` resolution `SqlitePersonalRecordRepository.resolveFormula` already establishes (ADR-0015) - only called for `metric === 'e1rm'`, never for `top_set`/`volume`. */
  private async resolveOneRmFormula(tx?: SqlExecutor): Promise<OneRmFormula> {
    const key = await this.deps.settings.get('oneRm.formula', tx);
    return key === 'brzycki' ? brzyckiFormula : epleyFormula;
  }
}
