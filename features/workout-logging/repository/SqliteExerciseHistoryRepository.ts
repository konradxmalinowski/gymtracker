import type { DatabaseContext, SqlExecutor } from '@/repositories/contracts/database';
import type { EntityId } from '@/repositories/contracts/repository';
import type { SetType } from '../domain/setSemantics';
import type {
  BestPerformance,
  ExerciseHistoryRepository,
  ExerciseSessionEntry,
  PreviousPerformance,
  PreviousPerformanceSet,
} from './ExerciseHistoryRepository';

export interface ExerciseHistoryRepositoryDependencies {
  db: DatabaseContext;
}

interface SessionKeyRow {
  session_id: string;
  local_date: string;
  performed_at: number;
}

interface WorkingSetRow {
  id: string;
  set_type: SetType;
  weight_kg: number | null;
  reps: number | null;
  duration_seconds: number | null;
  distance_m: number | null;
  rpe: number | null;
  performed_at: number;
  session_exercise_id: string;
}

interface BestValueRow {
  value: number;
  performed_at: number;
}

interface SessionEntryRow {
  session_id: string;
  local_date: string;
  performed_at: number;
  set_count: number;
  top_weight_kg: number | null;
  top_reps: number | null;
  total_volume_kg: number | null;
}

/** Every eligible-for-a-PR set type - `weight`/`reps` "best" and "top" aggregates below are all scoped to this, matching `RECORD_ELIGIBLE_SET_TYPES` in `features/records/domain/Estimated1RM.ts` (kept as a local SQL literal rather than an import - see this class's own doc comment for why). */
const RECORD_ELIGIBLE_SET_TYPES_SQL = "('normal', 'failure')";

/**
 * SQLite implementation of `ExerciseHistoryRepository`.
 *
 * Read-only, so it takes only `db` - no `clock`/`idGenerator`, and no
 * `BaseSqliteRepository` (that base class exists for id generation, audit
 * stamping and the soft-delete lifecycle, none of which a repository that
 * never writes needs; mirrors how `StatisticsRepository`, a later read-model
 * phase, is described in ARCHITECTURE.md section 8.3 as "returns DTOs only").
 *
 * Every query reads through `v_working_set` (`database/schema.sql` section
 * 7.10), which already encodes "completed, non-deleted, session completed" -
 * the exact eligibility this read model needs and the same view
 * `SqlitePersonalRecordRepository.rebuild()` reads through, so the two stay
 * consistent about what counts as a real, completed set without either one
 * re-deriving the filter.
 *
 * The `('normal', 'failure')` set-type filter is a local SQL literal, not an
 * import of `RECORD_ELIGIBLE_SET_TYPES` from `features/records` - pulling in
 * a cross-feature import for one constant would be a real dependency edge
 * for a single string literal that is, by design, a transcription of the
 * same `workout_set.set_type` CHECK constraint every other copy in this
 * codebase already transcribes independently (see `features/records/domain/
 * Estimated1RM.ts`'s own header comment on this exact tradeoff).
 */
export class SqliteExerciseHistoryRepository implements ExerciseHistoryRepository {
  constructor(private readonly deps: ExerciseHistoryRepositoryDependencies) {}

  async getPreviousPerformance(
    exerciseId: EntityId,
    beforeSessionId?: EntityId,
    tx?: SqlExecutor,
  ): Promise<PreviousPerformance | null> {
    const executor = tx ?? this.deps.db;

    const sessionKey = beforeSessionId
      ? await executor.selectOne<SessionKeyRow>(
          `SELECT session_id, local_date, MAX(performed_at) AS performed_at
           FROM v_working_set
           WHERE exercise_id = ? AND session_id != ?
           GROUP BY session_id, local_date
           ORDER BY performed_at DESC
           LIMIT 1`,
          [exerciseId, beforeSessionId],
        )
      : await executor.selectOne<SessionKeyRow>(
          `SELECT session_id, local_date, MAX(performed_at) AS performed_at
           FROM v_working_set
           WHERE exercise_id = ?
           GROUP BY session_id, local_date
           ORDER BY performed_at DESC
           LIMIT 1`,
          [exerciseId],
        );

    if (!sessionKey) {
      return null;
    }

    const setRows = await executor.select<WorkingSetRow>(
      `SELECT id, set_type, weight_kg, reps, duration_seconds, distance_m, rpe, performed_at, session_exercise_id
       FROM v_working_set
       WHERE exercise_id = ? AND session_id = ?
       ORDER BY performed_at ASC, id ASC`,
      [exerciseId, sessionKey.session_id],
    );

    const sets: PreviousPerformanceSet[] = setRows.map((row) => ({
      id: row.id,
      setType: row.set_type,
      weightKg: row.weight_kg,
      reps: row.reps,
      durationSeconds: row.duration_seconds,
      distanceM: row.distance_m,
      rpe: row.rpe,
      performedAt: row.performed_at,
    }));

    return {
      sessionId: sessionKey.session_id,
      // Every row in `setRows` shares the same session_exercise_id for a
      // given (exercise, session) pair - session_exercise is 1:1 with
      // (session, exercise) by construction (addExercise never creates a
      // second row for an exercise already in the session).
      sessionExerciseId: setRows[0]?.session_exercise_id ?? '',
      localDate: sessionKey.local_date,
      performedAt: sessionKey.performed_at,
      sets,
    };
  }

  async getBestPerformance(
    exerciseId: EntityId,
    tx?: SqlExecutor,
  ): Promise<BestPerformance | null> {
    const executor = tx ?? this.deps.db;

    const anyEligible = await executor.selectOne<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM v_working_set
       WHERE exercise_id = ? AND set_type IN ${RECORD_ELIGIBLE_SET_TYPES_SQL}`,
      [exerciseId],
    );
    if (!anyEligible || anyEligible.cnt === 0) {
      return null;
    }

    const bestWeight = await executor.selectOne<BestValueRow>(
      `SELECT weight_kg AS value, performed_at FROM v_working_set
       WHERE exercise_id = ? AND set_type IN ${RECORD_ELIGIBLE_SET_TYPES_SQL} AND weight_kg IS NOT NULL
       ORDER BY weight_kg DESC, performed_at ASC LIMIT 1`,
      [exerciseId],
    );
    const bestReps = await executor.selectOne<BestValueRow>(
      `SELECT reps AS value, performed_at FROM v_working_set
       WHERE exercise_id = ? AND set_type IN ${RECORD_ELIGIBLE_SET_TYPES_SQL} AND reps IS NOT NULL
       ORDER BY reps DESC, performed_at ASC LIMIT 1`,
      [exerciseId],
    );
    const bestVolume = await executor.selectOne<BestValueRow>(
      `SELECT volume_kg AS value, performed_at FROM v_working_set
       WHERE exercise_id = ? AND set_type IN ${RECORD_ELIGIBLE_SET_TYPES_SQL} AND volume_kg > 0
       ORDER BY volume_kg DESC, performed_at ASC LIMIT 1`,
      [exerciseId],
    );

    return {
      bestWeightKg: bestWeight?.value ?? null,
      bestWeightAchievedAt: bestWeight?.performed_at ?? null,
      bestReps: bestReps?.value ?? null,
      bestRepsAchievedAt: bestReps?.performed_at ?? null,
      bestSetVolumeKg: bestVolume?.value ?? null,
      bestSetVolumeAchievedAt: bestVolume?.performed_at ?? null,
    };
  }

  async listRecentSessionsForExercise(
    exerciseId: EntityId,
    limit: number,
    tx?: SqlExecutor,
  ): Promise<ExerciseSessionEntry[]> {
    const executor = tx ?? this.deps.db;
    const rows = await executor.select<SessionEntryRow>(
      `SELECT session_id,
              local_date,
              MAX(performed_at) AS performed_at,
              COUNT(*) AS set_count,
              MAX(CASE WHEN set_type IN ${RECORD_ELIGIBLE_SET_TYPES_SQL} THEN weight_kg END) AS top_weight_kg,
              MAX(CASE WHEN set_type IN ${RECORD_ELIGIBLE_SET_TYPES_SQL} THEN reps END) AS top_reps,
              SUM(volume_kg) AS total_volume_kg
       FROM v_working_set
       WHERE exercise_id = ?
       GROUP BY session_id, local_date
       ORDER BY performed_at DESC
       LIMIT ?`,
      [exerciseId, limit],
    );

    return rows.map((row) => ({
      sessionId: row.session_id,
      localDate: row.local_date,
      performedAt: row.performed_at,
      setCount: row.set_count,
      topSetWeightKg: row.top_weight_kg,
      topSetReps: row.top_reps,
      totalVolumeKg: row.total_volume_kg ?? 0,
    }));
  }
}
