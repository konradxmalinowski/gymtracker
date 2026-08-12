import type { SqlExecutor } from '@/repositories/contracts/database';
import type { EntityId } from '@/repositories/contracts/repository';
import type { SetType } from '../domain/setSemantics';

/** One completed, non-deleted set from a past session - every set type, not just working sets (a lifter reviewing "what I did last time" wants to see warm-ups too). */
export interface PreviousPerformanceSet {
  id: EntityId;
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceM: number | null;
  rpe: number | null;
  performedAt: number;
}

/**
 * FR-15's "previous weight, previous reps": the most recent past session in
 * which this exercise was performed, with every completed set from that
 * session. `ProgressionAdvisor` (`features/records`)'s
 * `lastSessionWorkingSets` input is derived from `sets` by the caller
 * (filtering to `normal`/`failure`) - this repository does not pre-filter,
 * per `ProgressionAdvisor`'s own "which sets count as working sets is the
 * caller's decision" precedent.
 */
export interface PreviousPerformance {
  sessionId: EntityId;
  sessionExerciseId: EntityId;
  localDate: string;
  /** The session's most recent set for this exercise - "3 days ago" material. */
  performedAt: number;
  /** Oldest to newest. */
  sets: readonly PreviousPerformanceSet[];
}

/**
 * FR-15's "best weight, best reps" - each resolved independently (the set
 * that hit the best weight is not necessarily the same set that hit the best
 * reps), scoped to `normal`/`failure` sets only, matching PR eligibility.
 * `null` when the exercise has no eligible history at all - distinct from
 * "every field individually null", the same "genuinely empty, not zeros"
 * distinction `getPreviousPerformance` makes by returning `null` outright.
 */
export interface BestPerformance {
  bestWeightKg: number | null;
  /** Ties broken toward the earliest achievement of that weight. */
  bestWeightAchievedAt: number | null;
  bestReps: number | null;
  bestRepsAchievedAt: number | null;
  bestSetVolumeKg: number | null;
  bestSetVolumeAchievedAt: number | null;
}

/**
 * One row of `listRecentSessionsForExercise` - a session summarized down to
 * what a history list needs. `setCount` counts every completed, non-deleted
 * set for the exercise in that session (all set types); `topSetWeightKg`/
 * `topSetReps` are each independently maxed within the session (not
 * necessarily from the same set) - the same judgment call `BestPerformance`
 * makes, at session scope instead of all-time scope.
 */
export interface ExerciseSessionEntry {
  sessionId: EntityId;
  localDate: string;
  performedAt: number;
  setCount: number;
  topSetWeightKg: number | null;
  topSetReps: number | null;
  totalVolumeKg: number;
}

/**
 * `ExerciseHistoryRepository` (read model, feature: `workout-logging`) -
 * ARCHITECTURE.md section 8.3's exact method list. CQRS-lite: every method
 * returns a flat, SQL-aggregated DTO - never a load-all-then-reduce-in-JS
 * pass over `workout_set` (CLAUDE.md's data-layer section; the same
 * convention `StatisticsRepository`, a later phase, will follow).
 *
 * Read-only, so it does not extend `BaseSqliteRepository` (that class's
 * `insertRow`/`updateRow`/soft-delete lifecycle has nothing for a repository
 * that writes nothing) - see `SqliteExerciseHistoryRepository`'s own doc
 * comment.
 */
export interface ExerciseHistoryRepository {
  /**
   * The most recent past session with a completed set for this exercise, or
   * `null` when none exists. `beforeSessionId`, when given, excludes that
   * exact session id from consideration - the caller's own in-progress
   * session, so "previous performance" means the session before this one,
   * not a set logged earlier today in the same session.
   */
  getPreviousPerformance(
    exerciseId: EntityId,
    beforeSessionId?: EntityId,
    tx?: SqlExecutor,
  ): Promise<PreviousPerformance | null>;
  getBestPerformance(exerciseId: EntityId, tx?: SqlExecutor): Promise<BestPerformance | null>;
  listRecentSessionsForExercise(
    exerciseId: EntityId,
    limit: number,
    tx?: SqlExecutor,
  ): Promise<ExerciseSessionEntry[]>;
}
