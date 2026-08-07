import { setVolumeKg } from './SetVolume';
import { SET_TYPE_SEMANTICS, type SetType } from './setSemantics';

/**
 * `SessionTotals` - ARCHITECTURE.md section 6.2. The single definition of the
 * four numbers `finish()` denormalizes onto `workout_session`
 * (`duration_seconds`, `total_volume_kg`, `total_sets`, `total_reps`), pure so
 * that a later recomputation (P9's summary screen, a history edit) can call the
 * exact same function rather than re-deriving the arithmetic.
 *
 * Estimated calories is named alongside these in section 6.2 but is deliberately
 * absent: it is off by default (D-04) and lands with the summary screen in P9.
 */
export interface SessionTotalsSetInput {
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  isCompleted: boolean;
}

export interface SessionDurationInput {
  startedAt: number;
  finishedAt: number;
  /** `workout_session.paused_ms` - accumulated paused time, excluded from the duration. */
  pausedMs: number;
}

export interface SessionTotals {
  durationSeconds: number;
  totalVolumeKg: number;
  totalSets: number;
  totalReps: number;
}

/**
 * Whole elapsed seconds between start and finish, minus paused time. Truncated
 * rather than rounded (a workout that ran 90.9 s reports 90 s, the same way a
 * stopwatch reads), and clamped at 0 so a clock adjustment or a
 * `pausedMs` larger than the elapsed window can never write a negative
 * `duration_seconds`.
 */
export function sessionDurationSeconds(input: SessionDurationInput): number {
  const elapsedMs = input.finishedAt - input.startedAt - input.pausedMs;
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return 0;
  }
  return Math.floor(elapsedMs / 1000);
}

/**
 * Totals over the sets a caller passes in. The caller is responsible for
 * excluding soft-deleted rows; this function only applies the completion and
 * set-type rules:
 *
 * - **Volume** - `setVolumeKg` per set, over completed sets only.
 * - **Sets** - the ADR-0006 "counts toward sets completed" column, over
 *   completed sets: `warmup` and `drop` are excluded (a drop segment is part of
 *   its parent's one effort), `assisted` and `partial` are included.
 * - **Reps** - every completed set's reps regardless of type. This deliberately
 *   matches `v_session_summary.total_reps`, which sums `reps` across all of
 *   `v_working_set` without consulting the set-type table, so the denormalized
 *   column and the view never disagree. Note the asymmetry with `totalSets`:
 *   that one follows ADR-0006's normative table (which the view's own
 *   `working_set_count` does not implement), because `workout_session.total_sets`
 *   is the number a user reads as "sets completed".
 */
export function computeSessionTotals(
  duration: SessionDurationInput,
  sets: readonly SessionTotalsSetInput[],
): SessionTotals {
  let totalVolumeKg = 0;
  let totalSets = 0;
  let totalReps = 0;

  for (const set of sets) {
    if (!set.isCompleted) {
      continue;
    }
    totalVolumeKg += setVolumeKg(set);
    if (SET_TYPE_SEMANTICS[set.setType].countsTowardSetCount) {
      totalSets += 1;
    }
    totalReps += set.reps ?? 0;
  }

  return {
    durationSeconds: sessionDurationSeconds(duration),
    totalVolumeKg,
    totalSets,
    totalReps,
  };
}
