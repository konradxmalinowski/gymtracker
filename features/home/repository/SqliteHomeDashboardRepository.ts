import type { DatabaseContext, SqlExecutor } from '@/repositories/contracts/database';
import type { EntityId } from '@/repositories/contracts/repository';
import type {
  HomeDashboardRepository,
  HomeLastSessionDto,
  HomeWeeklySummary,
} from './HomeDashboardRepository';

export interface HomeDashboardRepositoryDependencies {
  db: DatabaseContext;
}

interface LocalDateRow {
  local_date: string;
}

interface WeeklySummaryRow {
  workouts: number;
  sets: number | null;
  volume_kg: number | null;
  duration_seconds: number | null;
}

interface LastSessionRow {
  id: string;
  title: string;
  local_date: string;
  total_volume_kg: number | null;
  total_sets: number | null;
  duration_seconds: number | null;
  finished_at: number | null;
}

interface PlanDayIdRow {
  plan_day_id: string | null;
}

/**
 * SQLite implementation of `HomeDashboardRepository`.
 *
 * Read-only, so - mirroring `SqliteExerciseHistoryRepository`'s own doc
 * comment - it takes only `db`, no `clock`/`idGenerator`, and no
 * `BaseSqliteRepository`. Every query filters `status = 'completed' AND
 * deleted_at IS NULL` explicitly and in full, rather than relying on a
 * shared view or partial filter, since this project's own P5/P6 security
 * reviews have flagged a missing `deleted_at IS NULL` filter as a finding
 * before (`reports/security-2026-08-06-p5.md`,
 * `reports/security-2026-08-07-p6.md`) - repeating that omission here would
 * be the same class of gap, not a new one.
 */
export class SqliteHomeDashboardRepository implements HomeDashboardRepository {
  constructor(private readonly deps: HomeDashboardRepositoryDependencies) {}

  async getTrainingLocalDates(sinceLocalDate: string, tx?: SqlExecutor): Promise<string[]> {
    const executor = tx ?? this.deps.db;
    const rows = await executor.select<LocalDateRow>(
      `SELECT DISTINCT local_date
       FROM workout_session
       WHERE status = 'completed' AND deleted_at IS NULL AND local_date >= ?
       ORDER BY local_date DESC`,
      [sinceLocalDate],
    );
    return rows.map((row) => row.local_date);
  }

  async getWeeklySummary(
    localDateFrom: string,
    localDateTo: string,
    tx?: SqlExecutor,
  ): Promise<HomeWeeklySummary> {
    const executor = tx ?? this.deps.db;
    const row = await executor.selectOne<WeeklySummaryRow>(
      `SELECT COUNT(*) AS workouts,
              SUM(total_sets) AS sets,
              SUM(total_volume_kg) AS volume_kg,
              SUM(duration_seconds) AS duration_seconds
       FROM workout_session
       WHERE status = 'completed' AND deleted_at IS NULL AND local_date BETWEEN ? AND ?`,
      [localDateFrom, localDateTo],
    );

    // SQL SUM/COUNT over zero matching rows still returns one row, with
    // COUNT = 0 but every SUM = NULL - coerced to 0 here so the DTO's
    // numeric fields are never null.
    return {
      workouts: row?.workouts ?? 0,
      sets: row?.sets ?? 0,
      volumeKg: row?.volume_kg ?? 0,
      durationSeconds: row?.duration_seconds ?? 0,
    };
  }

  async getLastCompletedSession(tx?: SqlExecutor): Promise<HomeLastSessionDto | null> {
    const executor = tx ?? this.deps.db;
    const row = await executor.selectOne<LastSessionRow>(
      `SELECT id, title, local_date, total_volume_kg, total_sets, duration_seconds, finished_at
       FROM workout_session
       WHERE status = 'completed' AND deleted_at IS NULL
       ORDER BY finished_at DESC
       LIMIT 1`,
    );

    if (!row) {
      return null;
    }

    // Non-null assertions on finished_at/the three totals are safe for the
    // same reason SessionListItem's own mapping in
    // SqliteWorkoutSessionRepository gives: CHECK (status <> 'completed' OR
    // finished_at IS NOT NULL) plus finish() always writing all of them
    // atomically together.
    return {
      id: row.id,
      title: row.title,
      localDate: row.local_date,
      totalVolumeKg: row.total_volume_kg!,
      totalSets: row.total_sets!,
      durationSeconds: row.duration_seconds!,
      finishedAt: row.finished_at!,
    };
  }

  async getMostRecentCompletedPlanDayId(
    planId: EntityId,
    tx?: SqlExecutor,
  ): Promise<EntityId | null> {
    const executor = tx ?? this.deps.db;
    const row = await executor.selectOne<PlanDayIdRow>(
      `SELECT plan_day_id
       FROM workout_session
       WHERE status = 'completed' AND deleted_at IS NULL AND plan_id = ?
       ORDER BY finished_at DESC
       LIMIT 1`,
      [planId],
    );

    return row?.plan_day_id ?? null;
  }
}
