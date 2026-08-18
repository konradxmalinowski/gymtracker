import type { SqlExecutor } from '@/repositories/contracts/database';
import type { EntityId } from '@/repositories/contracts/repository';

/**
 * One `workout_session` row's totals, flattened for the Home dashboard's
 * "last workout" card - enough to render without a second query. Field
 * names/types mirror `WorkoutSessionRepository`'s `SessionListItem` (same
 * feature-adjacent convention: a completed session's `finishedAt` and the
 * four denormalized totals are non-null by construction, per the schema's
 * `CHECK (status <> 'completed' OR finished_at IS NOT NULL)` plus
 * `finish()` always writing all of them together).
 */
export interface HomeLastSessionDto {
  id: EntityId;
  title: string;
  localDate: string;
  totalVolumeKg: number;
  totalSets: number;
  durationSeconds: number;
  finishedAt: number;
}

/**
 * `getWeeklySummary`'s result - a single-table SQL aggregate over
 * `workout_session` (every source column is already denormalized on finish,
 * so no join to `workout_set` is needed). Zero matching rows still returns
 * this shape with every field at `0`, never `null` - see the implementation's
 * own note on coercing SQL `SUM`'s `NULL`-over-zero-rows result.
 */
export interface HomeWeeklySummary {
  workouts: number;
  sets: number;
  volumeKg: number;
  durationSeconds: number;
}

/**
 * `HomeDashboardRepository` (read model, feature: `home`) - P10's lightweight,
 * home-owned replacement for the `streak()`/`weeklySummary()` methods
 * ARCHITECTURE.md section 8.3 originally assigned to `StatisticsRepository`
 * (still an empty P11 skeleton as of this phase; see the plan's "Decisions
 * made this session" note 1 and the forthcoming ADR-0019 for the full
 * rationale and the migration note for P11).
 *
 * Read-only, so - like `ExerciseHistoryRepository` before it - this does not
 * extend `BaseSqliteRepository` (nothing here writes, so there is no id
 * generation/audit-stamping/soft-delete lifecycle to inherit) and has no
 * accompanying service: every method returns a flat, SQL-aggregated DTO with
 * nothing to Zod-validate on a read path.
 */
export interface HomeDashboardRepository {
  /** Distinct `local_date`s of every completed, non-deleted session on or after `sinceLocalDate`, most recent first - feeds `calculateStreak`. */
  getTrainingLocalDates(sinceLocalDate: string, tx?: SqlExecutor): Promise<string[]>;
  /** Inclusive `[localDateFrom, localDateTo]` aggregate over completed, non-deleted sessions. */
  getWeeklySummary(
    localDateFrom: string,
    localDateTo: string,
    tx?: SqlExecutor,
  ): Promise<HomeWeeklySummary>;
  /** The most recently finished completed, non-deleted session, or `null` if none exists yet. */
  getLastCompletedSession(tx?: SqlExecutor): Promise<HomeLastSessionDto | null>;
  /** The `plan_day_id` of the most recently finished completed, non-deleted session against `planId` - `null` if there is none, or if that session's `plan_day_id` is itself `null`. Feeds `nextSuggestedPlanDay`. */
  getMostRecentCompletedPlanDayId(planId: EntityId, tx?: SqlExecutor): Promise<EntityId | null>;
}
