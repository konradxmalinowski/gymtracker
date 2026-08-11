import type { SqlExecutor, SqlParam } from '@/repositories/contracts/database';
import type { EntityId } from '@/repositories/contracts/repository';
import {
  BaseSqliteRepository,
  RepositoryNotFoundError,
  type AuditedRow,
} from '@/repositories/base';
import { boolFromSql, boolToSql, jsonFromSql } from '@/repositories/mapping';
import {
  formatExerciseName,
  type ExerciseLevel,
  type ExerciseListItem,
  type ExerciseTrackingType,
} from '@/features/exercise-library';
import { resolveRestSeconds } from '@/features/rest-timer';
import { computeSessionTotals } from '../domain/SessionTotals';
import type { SetType } from '../domain/setSemantics';
import {
  DropSegmentSetTypeError,
  DropSetParentInvalidError,
  SessionAlreadyInProgressError,
  SessionNotInProgressError,
  SupersetSpansMultipleSessionsError,
} from './errors';
import type {
  ActiveSessionAggregate,
  ActiveSessionState,
  ActiveStatePatch,
  CompleteSetValues,
  CompletedSetResult,
  SessionExercise,
  SessionStatus,
  SessionSummary,
  SetSeed,
  UpdateSetPatch,
  WorkoutSessionRepository,
  WorkoutSet,
} from './WorkoutSessionRepository';

/** Fallback title for a "Quick Start" workout. Exported so a presentation layer can substitute a localized string via `startEmpty`'s `title` parameter rather than this ever reaching a screen as hardcoded copy. */
export const DEFAULT_QUICK_START_TITLE = 'Quick Start';

interface WorkoutSessionRow extends AuditedRow {
  plan_id: string | null;
  plan_day_id: string | null;
  plan_name_snapshot: string | null;
  plan_day_name_snapshot: string | null;
  title: string;
  status: SessionStatus;
  started_at: number;
  finished_at: number | null;
  local_date: string;
  tz_offset_minutes: number;
  duration_seconds: number | null;
  paused_ms: number;
  total_volume_kg: number | null;
  total_sets: number | null;
  total_reps: number | null;
  estimated_kcal: number | null;
  notes: string | null;
}

interface SessionExerciseRow extends AuditedRow {
  session_id: string;
  exercise_id: string;
  exercise_name_snapshot: string;
  sort_order: number;
  superset_group: number | null;
  rest_seconds_override: number | null;
  note: string | null;
}

interface WorkoutSetRow extends AuditedRow {
  session_exercise_id: string;
  session_id: string;
  exercise_id: string;
  set_index: number;
  set_type: SetType;
  parent_set_id: string | null;
  weight_kg: number | null;
  reps: number | null;
  duration_seconds: number | null;
  distance_m: number | null;
  rpe: number | null;
  is_completed: number;
  completed_at: number | null;
  performed_at: number;
  note: string | null;
}

interface ActiveSessionStateRow {
  session_id: string;
  focused_session_exercise_id: string | null;
  timer_deadline_at: number | null;
  timer_total_seconds: number | null;
  timer_notification_id: string | null;
  paused_at: number | null;
  scroll_offset: number | null;
  updated_at: number;
}

/** Mirrors `SqlitePlanRepository`'s `ExerciseSummaryRow` exactly - same columns, same mapping - so the embedded `ExerciseListItem` shape stays identical across both features. */
interface ExerciseSummaryRow {
  id: string;
  source: 'catalog' | 'custom';
  catalog_slug: string | null;
  name_en: string;
  name_pl: string | null;
  level: ExerciseLevel | null;
  equipment_slug: string | null;
  body_part: string | null;
  tracking_type: ExerciseTrackingType;
  images: string;
  ud_is_favorite: number;
  ud_display_name_override: string | null;
}

/** Values a new set inherits when nothing on the `SetSeed` overrides them. */
interface SetPrefill {
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceM: number | null;
  rpe: number | null;
}

type SessionChildTable = 'session_exercise' | 'workout_set';

const EMPTY_PREFILL: SetPrefill = {
  setType: 'normal',
  weightKg: null,
  reps: null,
  durationSeconds: null,
  distanceM: null,
  rpe: null,
};

/** Set types a cross-session pre-fill will look at - a warm-up, a drop segment or an assisted set is not the number a user wants suggested for their next working set (FR-11). */
const PREFILLABLE_SET_TYPES = "('normal','failure')";

function mapExerciseSummaryRow(row: ExerciseSummaryRow): ExerciseListItem {
  const images = jsonFromSql<string[]>(row.images, []);
  return {
    id: row.id,
    source: row.source,
    catalogSlug: row.catalog_slug,
    nameEn: row.name_en,
    namePl: row.name_pl,
    displayNameOverride: row.ud_display_name_override,
    level: row.level,
    equipmentSlug: row.equipment_slug,
    bodyPart: row.body_part,
    trackingType: row.tracking_type,
    primaryImage: images[0] ?? null,
    isFavorite: boolFromSql(row.ud_is_favorite),
  };
}

function mapSetRow(row: WorkoutSetRow): WorkoutSet {
  return {
    id: row.id,
    sessionExerciseId: row.session_exercise_id,
    sessionId: row.session_id,
    exerciseId: row.exercise_id,
    setIndex: row.set_index,
    setType: row.set_type,
    parentSetId: row.parent_set_id,
    weightKg: row.weight_kg,
    reps: row.reps,
    durationSeconds: row.duration_seconds,
    distanceM: row.distance_m,
    rpe: row.rpe,
    isCompleted: boolFromSql(row.is_completed),
    completedAt: row.completed_at,
    performedAt: row.performed_at,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapActiveStateRow(row: ActiveSessionStateRow): ActiveSessionState {
  return {
    sessionId: row.session_id,
    focusedSessionExerciseId: row.focused_session_exercise_id,
    timerDeadlineAt: row.timer_deadline_at,
    timerTotalSeconds: row.timer_total_seconds,
    timerNotificationId: row.timer_notification_id,
    pausedAt: row.paused_at,
    scrollOffset: row.scroll_offset,
    updatedAt: row.updated_at,
  };
}

function mapSessionRow(
  row: WorkoutSessionRow,
): Omit<ActiveSessionAggregate, 'exercises' | 'activeState'> {
  return {
    id: row.id,
    planId: row.plan_id,
    planDayId: row.plan_day_id,
    planNameSnapshot: row.plan_name_snapshot,
    planDayNameSnapshot: row.plan_day_name_snapshot,
    title: row.title,
    status: row.status,
    startedAt: row.started_at,
    localDate: row.local_date,
    tzOffsetMinutes: row.tz_offset_minutes,
    pausedMs: row.paused_ms,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed/i.test(message) || /SQLITE_CONSTRAINT/i.test(message);
}

/**
 * SQLite implementation of `WorkoutSessionRepository` - the crash-safe write
 * path ADR-0005 specifies. Three things about its shape are load-bearing:
 *
 * 1. **There is no draft.** Every method writes the real tables
 *    (`workout_session`, `session_exercise`, `workout_set`,
 *    `active_session_state`) and commits. `findInProgress()` is a `SELECT`, not
 *    a deserialization, which is exactly why recovery cannot fail on a schema
 *    change.
 *
 * 2. **`active_session_state` is maintained incrementally**, the way
 *    `SqliteExerciseRepository` maintains its FTS index: every mutation that
 *    changes what the workout screen shows also stamps that row's `updated_at`
 *    inside the same transaction (`touchActiveState`). The row is created with
 *    the session and deleted by `finish`/`discard`, so "a row exists" and "a
 *    workout is in progress" can never drift apart.
 *
 * 3. **Extends `BaseSqliteRepository` scoped to `workout_session` only.** The
 *    inherited `insertRow`/`updateRow`/`softDelete`/`restore`/`purge` all
 *    operate on that one table; `session_exercise` and `workout_set` are handled
 *    by this class's own table-parameterized `insertInto`/`updateRowIn`/
 *    `softDeleteRow`/`restoreRow`, the same small helpers
 *    `SqlitePlanRepository` needed for `plan_day`/`plan_day_exercise` and for
 *    the same reason. Every table name reaching them is one of this file's own
 *    literals, never caller input.
 */
export class SqliteWorkoutSessionRepository
  extends BaseSqliteRepository<ActiveSessionAggregate, WorkoutSessionRow>
  implements WorkoutSessionRepository
{
  protected readonly table = 'workout_session';

  /**
   * Produces a shell: the session's own columns with no exercises and a
   * synthetic (all-null) active state. The real aggregate needs async joins
   * `mapRow` cannot perform - `loadAggregate()` is the path that fills both in,
   * the same split `SqlitePlanRepository.mapRow`/`getPlan` uses.
   */
  protected mapRow(row: WorkoutSessionRow): ActiveSessionAggregate {
    return {
      ...mapSessionRow(row),
      exercises: [],
      activeState: {
        sessionId: row.id,
        focusedSessionExerciseId: null,
        timerDeadlineAt: null,
        timerTotalSeconds: null,
        timerNotificationId: null,
        pausedAt: null,
        scrollOffset: null,
        updatedAt: row.updated_at,
      },
    };
  }

  // --- lifecycle ----------------------------------------------------------------

  async findInProgress(tx?: SqlExecutor): Promise<ActiveSessionAggregate | null> {
    const executor = this.executor(tx);
    const row = await executor.selectOne<WorkoutSessionRow>(
      "SELECT * FROM workout_session WHERE status = 'in_progress' AND deleted_at IS NULL",
    );
    return row ? this.loadAggregate(row, executor) : null;
  }

  async startFromPlanDay(
    planDayId: EntityId,
    startedAt: number,
    globalDefaultRestSeconds: number,
    tx?: SqlExecutor,
  ): Promise<ActiveSessionAggregate> {
    const runner = async (t: SqlExecutor): Promise<ActiveSessionAggregate> => {
      await this.assertNoSessionInProgress(t);

      const day = await t.selectOne<{
        id: string;
        name: string;
        plan_id: string;
        plan_name: string;
      }>(
        `SELECT pd.id, pd.name, pd.plan_id, p.name AS plan_name
         FROM plan_day pd
         JOIN plan p ON p.id = pd.plan_id
         WHERE pd.id = ? AND pd.deleted_at IS NULL`,
        [planDayId],
      );
      if (!day) {
        throw new RepositoryNotFoundError('plan_day', planDayId);
      }

      const sessionId = await this.insertSession(
        {
          plan_id: day.plan_id,
          plan_day_id: day.id,
          plan_name_snapshot: day.plan_name,
          plan_day_name_snapshot: day.name,
          title: day.name,
        },
        startedAt,
        t,
      );

      const dayExercises = await t.select<{
        exercise_id: string;
        sort_order: number;
        superset_group: number | null;
        rest_seconds: number | null;
        note: string | null;
        name_en: string;
        name_pl: string | null;
        display_name_override: string | null;
        default_rest_seconds: number | null;
      }>(
        `SELECT pde.exercise_id, pde.sort_order, pde.superset_group, pde.rest_seconds, pde.note,
                e.name_en, e.name_pl, ud.display_name_override, ud.default_rest_seconds
         FROM plan_day_exercise pde
         JOIN exercise e ON e.id = pde.exercise_id
         LEFT JOIN exercise_user_data ud ON ud.exercise_id = e.id
         WHERE pde.plan_day_id = ? AND pde.deleted_at IS NULL
         ORDER BY pde.sort_order ASC`,
        [planDayId],
      );

      for (let index = 0; index < dayExercises.length; index += 1) {
        const dayExercise = dayExercises[index]!;
        await this.insertInto(
          'session_exercise',
          {
            session_id: sessionId,
            exercise_id: dayExercise.exercise_id,
            exercise_name_snapshot: formatExerciseName({
              nameEn: dayExercise.name_en,
              namePl: dayExercise.name_pl,
              displayNameOverride: dayExercise.display_name_override,
            }),
            sort_order: index,
            superset_group: dayExercise.superset_group,
            rest_seconds_override: resolveRestSeconds({
              exerciseDefaultSeconds: dayExercise.default_rest_seconds,
              planDaySeconds: dayExercise.rest_seconds,
              globalDefaultSeconds: globalDefaultRestSeconds,
            }),
            note: dayExercise.note,
          },
          t,
          startedAt,
        );
      }

      return this.requireAggregate(sessionId, t);
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  async startEmpty(
    startedAt: number,
    title: string = DEFAULT_QUICK_START_TITLE,
    tx?: SqlExecutor,
  ): Promise<ActiveSessionAggregate> {
    const runner = async (t: SqlExecutor): Promise<ActiveSessionAggregate> => {
      await this.assertNoSessionInProgress(t);
      const sessionId = await this.insertSession(
        {
          plan_id: null,
          plan_day_id: null,
          plan_name_snapshot: null,
          plan_day_name_snapshot: null,
          title,
        },
        startedAt,
        t,
      );
      return this.requireAggregate(sessionId, t);
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  async finish(sessionId: EntityId, finishedAt: number, tx?: SqlExecutor): Promise<SessionSummary> {
    const runner = async (t: SqlExecutor): Promise<SessionSummary> => {
      const session = await this.requireInProgressSession(sessionId, t);

      // Sets belonging to a removed (soft-deleted) exercise are excluded here as
      // well as by their own `deleted_at` - `removeExercise` cascades the soft
      // delete, so this join is a second line of defence rather than the primary
      // filter, and it keeps these totals equal to what `v_working_set` sees.
      const setRows = await t.select<{
        set_type: SetType;
        weight_kg: number | null;
        reps: number | null;
        is_completed: number;
      }>(
        `SELECT ws.set_type, ws.weight_kg, ws.reps, ws.is_completed
         FROM workout_set ws
         JOIN session_exercise se ON se.id = ws.session_exercise_id
         WHERE ws.session_id = ? AND ws.deleted_at IS NULL AND se.deleted_at IS NULL`,
        [sessionId],
      );

      const totals = computeSessionTotals(
        { startedAt: session.started_at, finishedAt, pausedMs: session.paused_ms },
        setRows.map((row) => ({
          setType: row.set_type,
          weightKg: row.weight_kg,
          reps: row.reps,
          isCompleted: boolFromSql(row.is_completed),
        })),
      );

      await t.run(
        `UPDATE workout_session
         SET status = 'completed', finished_at = ?, duration_seconds = ?, total_volume_kg = ?,
             total_sets = ?, total_reps = ?, updated_at = ?
         WHERE id = ?`,
        [
          finishedAt,
          totals.durationSeconds,
          totals.totalVolumeKg,
          totals.totalSets,
          totals.totalReps,
          this.now(),
          sessionId,
        ],
      );
      await this.deleteActiveState(sessionId, t);

      return {
        sessionId,
        title: session.title,
        startedAt: session.started_at,
        finishedAt,
        localDate: session.local_date,
        ...totals,
      };
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  async discard(sessionId: EntityId, tx?: SqlExecutor): Promise<void> {
    const runner = async (t: SqlExecutor): Promise<void> => {
      await this.requireInProgressSession(sessionId, t);
      await t.run("UPDATE workout_session SET status = 'discarded', updated_at = ? WHERE id = ?", [
        this.now(),
        sessionId,
      ]);
      await this.deleteActiveState(sessionId, t);
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  /**
   * Status-agnostic on purpose. Every other guard in this file exists to protect
   * a crash-safety or single-active-row invariant - you cannot append a set to a
   * finished workout because the totals are already denormalized onto the row,
   * and you cannot start a second session because a partial unique index says
   * so. A note carries none of that: it is free text on a column no aggregate,
   * view or statistic reads, and "I want to write down how that session felt"
   * is a thought that arrives *after* tapping Finish at least as often as
   * during. Restricting it to `in_progress` would buy no invariant and cost the
   * P9 history screen its edit path. `PlanRepository.renamePlan` is the same
   * kind of housekeeping write and is likewise unrestricted by plan state.
   *
   * The soft-delete guard stays, via the inherited `updateRow` - a deleted
   * session is not a thing to annotate.
   */
  async setSessionNotes(
    sessionId: EntityId,
    notes: string | null,
    tx?: SqlExecutor,
  ): Promise<void> {
    const runner = async (t: SqlExecutor): Promise<void> => {
      await this.updateRow(sessionId, { notes }, t);
      // No-ops once the session is finished or discarded (the row is gone by
      // then), which is exactly the intent: only a live workout screen needs
      // re-stamping.
      await this.touchActiveState(sessionId, t);
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  // --- exercises ----------------------------------------------------------------

  async addExercise(
    sessionId: EntityId,
    exerciseId: EntityId,
    globalDefaultRestSeconds: number,
    atIndex?: number,
    tx?: SqlExecutor,
  ): Promise<SessionExercise> {
    const runner = async (t: SqlExecutor): Promise<SessionExercise> => {
      await this.requireInProgressSession(sessionId, t);

      const nameRow = await t.selectOne<{
        name_en: string;
        name_pl: string | null;
        display_name_override: string | null;
        default_rest_seconds: number | null;
      }>(
        `SELECT e.name_en, e.name_pl, ud.display_name_override, ud.default_rest_seconds
         FROM exercise e
         LEFT JOIN exercise_user_data ud ON ud.exercise_id = e.id
         WHERE e.id = ?`,
        [exerciseId],
      );
      if (!nameRow) {
        throw new RepositoryNotFoundError('exercise', exerciseId);
      }

      const countRow = await t.selectOne<{ count: number }>(
        'SELECT COUNT(*) AS count FROM session_exercise WHERE session_id = ? AND deleted_at IS NULL',
        [sessionId],
      );
      const existingCount = countRow?.count ?? 0;
      const targetIndex =
        atIndex === undefined ? existingCount : Math.max(0, Math.min(atIndex, existingCount));

      if (targetIndex < existingCount) {
        await t.run(
          `UPDATE session_exercise SET sort_order = sort_order + 1, updated_at = ?
           WHERE session_id = ? AND deleted_at IS NULL AND sort_order >= ?`,
          [this.now(), sessionId, targetIndex],
        );
      }

      const { id } = await this.insertInto(
        'session_exercise',
        {
          session_id: sessionId,
          exercise_id: exerciseId,
          exercise_name_snapshot: formatExerciseName({
            nameEn: nameRow.name_en,
            namePl: nameRow.name_pl,
            displayNameOverride: nameRow.display_name_override,
          }),
          sort_order: targetIndex,
          superset_group: null,
          rest_seconds_override: resolveRestSeconds({
            exerciseDefaultSeconds: nameRow.default_rest_seconds,
            planDaySeconds: null,
            globalDefaultSeconds: globalDefaultRestSeconds,
          }),
          note: null,
        },
        t,
      );
      await this.touchActiveState(sessionId, t);

      const created = await this.loadSessionExercise(id, t);
      if (!created) {
        throw new Error('unreachable: session_exercise row was just inserted');
      }
      return created;
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  /**
   * Soft-deletes the exercise and, in the same transaction, its own
   * not-already-deleted sets. The cascade matters for correctness rather than
   * tidiness: `v_working_set` (and therefore every statistic) filters on
   * `workout_set.deleted_at` alone and never joins `session_exercise`, so a
   * removed exercise whose sets stayed live would keep contributing volume
   * forever.
   *
   * Independence with a set's own soft-delete lifecycle is preserved by
   * restoring only what this cascade took: `restoreExercise` matches on the
   * exact `deleted_at` value stamped here, so a set the user deleted separately
   * beforehand stays deleted. The one ambiguous case is a set deleted in the
   * same millisecond as its exercise, which no real interaction produces.
   */
  async removeExercise(sessionExerciseId: EntityId, tx?: SqlExecutor): Promise<void> {
    const runner = async (t: SqlExecutor): Promise<void> => {
      const row = await t.selectOne<{ session_id: string; deleted_at: number | null }>(
        'SELECT session_id, deleted_at FROM session_exercise WHERE id = ?',
        [sessionExerciseId],
      );
      if (!row) {
        throw new RepositoryNotFoundError('session_exercise', sessionExerciseId);
      }
      if (row.deleted_at !== null) {
        return;
      }
      const now = this.now();
      await t.run(
        'UPDATE session_exercise SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
        [now, now, sessionExerciseId],
      );
      await t.run(
        'UPDATE workout_set SET deleted_at = ?, updated_at = ? WHERE session_exercise_id = ? AND deleted_at IS NULL',
        [now, now, sessionExerciseId],
      );
      await this.touchActiveState(row.session_id, t);
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  /** Undoes `removeExercise`, restoring exactly the sets that cascade took (see its doc comment). */
  async restoreExercise(sessionExerciseId: EntityId, tx?: SqlExecutor): Promise<void> {
    const runner = async (t: SqlExecutor): Promise<void> => {
      const row = await t.selectOne<{ session_id: string; deleted_at: number | null }>(
        'SELECT session_id, deleted_at FROM session_exercise WHERE id = ?',
        [sessionExerciseId],
      );
      if (!row) {
        throw new RepositoryNotFoundError('session_exercise', sessionExerciseId);
      }
      if (row.deleted_at === null) {
        return;
      }
      const now = this.now();
      await t.run(
        'UPDATE workout_set SET deleted_at = NULL, updated_at = ? WHERE session_exercise_id = ? AND deleted_at = ?',
        [now, sessionExerciseId, row.deleted_at],
      );
      await t.run('UPDATE session_exercise SET deleted_at = NULL, updated_at = ? WHERE id = ?', [
        now,
        sessionExerciseId,
      ]);
      await this.touchActiveState(row.session_id, t);
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  async reorderExercises(
    sessionId: EntityId,
    orderedIds: readonly EntityId[],
    tx?: SqlExecutor,
  ): Promise<void> {
    const runner = async (t: SqlExecutor): Promise<void> => {
      const now = this.now();
      for (let index = 0; index < orderedIds.length; index += 1) {
        const id = orderedIds[index]!;
        const result = await t.run(
          `UPDATE session_exercise SET sort_order = ?, updated_at = ?
           WHERE id = ? AND session_id = ? AND deleted_at IS NULL`,
          [index, now, id, sessionId],
        );
        if (result.changes === 0) {
          throw new RepositoryNotFoundError('session_exercise', id);
        }
      }
      await this.touchActiveState(sessionId, t);
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  async setSupersetGroup(
    sessionExerciseIds: readonly EntityId[],
    group: number | null,
    tx?: SqlExecutor,
  ): Promise<void> {
    const runner = async (t: SqlExecutor): Promise<void> => {
      if (sessionExerciseIds.length === 0) {
        return;
      }
      const placeholders = sessionExerciseIds.map(() => '?').join(', ');
      const rows = await t.select<{ id: string; session_id: string }>(
        `SELECT id, session_id FROM session_exercise WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
        [...sessionExerciseIds],
      );
      if (rows.length !== sessionExerciseIds.length) {
        const found = new Set(rows.map((row) => row.id));
        const missing = sessionExerciseIds.find((id) => !found.has(id));
        throw new RepositoryNotFoundError('session_exercise', missing ?? sessionExerciseIds[0]!);
      }
      const sessionIds = new Set(rows.map((row) => row.session_id));
      if (sessionIds.size > 1) {
        throw new SupersetSpansMultipleSessionsError(sessionExerciseIds);
      }

      await t.run(
        `UPDATE session_exercise SET superset_group = ?, updated_at = ? WHERE id IN (${placeholders})`,
        [group, this.now(), ...sessionExerciseIds],
      );
      await this.touchActiveState(rows[0]!.session_id, t);
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  async setExerciseNote(
    sessionExerciseId: EntityId,
    note: string | null,
    tx?: SqlExecutor,
  ): Promise<void> {
    const runner = async (t: SqlExecutor): Promise<void> => {
      const row = await t.selectOne<{ session_id: string }>(
        'SELECT session_id FROM session_exercise WHERE id = ? AND deleted_at IS NULL',
        [sessionExerciseId],
      );
      if (!row) {
        throw new RepositoryNotFoundError('session_exercise', sessionExerciseId);
      }
      await this.updateRowIn('session_exercise', sessionExerciseId, { note }, t);
      await this.touchActiveState(row.session_id, t);
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  /** P7 tap-to-adjust write path - mirrors {@link setExerciseNote} exactly. */
  async setExerciseRestOverride(
    sessionExerciseId: EntityId,
    restSeconds: number,
    tx?: SqlExecutor,
  ): Promise<void> {
    const runner = async (t: SqlExecutor): Promise<void> => {
      const row = await t.selectOne<{ session_id: string }>(
        'SELECT session_id FROM session_exercise WHERE id = ? AND deleted_at IS NULL',
        [sessionExerciseId],
      );
      if (!row) {
        throw new RepositoryNotFoundError('session_exercise', sessionExerciseId);
      }
      await this.updateRowIn(
        'session_exercise',
        sessionExerciseId,
        { rest_seconds_override: restSeconds },
        t,
      );
      await this.touchActiveState(row.session_id, t);
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  // --- sets ---------------------------------------------------------------------

  async appendSet(
    sessionExerciseId: EntityId,
    seed: SetSeed,
    tx?: SqlExecutor,
  ): Promise<WorkoutSet> {
    const runner = async (t: SqlExecutor): Promise<WorkoutSet> => {
      const parent = await t.selectOne<{ id: string; session_id: string; exercise_id: string }>(
        'SELECT id, session_id, exercise_id FROM session_exercise WHERE id = ? AND deleted_at IS NULL',
        [sessionExerciseId],
      );
      if (!parent) {
        throw new RepositoryNotFoundError('session_exercise', sessionExerciseId);
      }

      const indexRow = await t.selectOne<{ next: number }>(
        `SELECT COALESCE(MAX(set_index), 0) + 1 AS next FROM workout_set
         WHERE session_exercise_id = ? AND deleted_at IS NULL`,
        [sessionExerciseId],
      );
      const prefill = await this.resolvePrefill(sessionExerciseId, parent, t);
      const values = applySeed(prefill, seed);
      const now = this.now();

      const { id } = await this.insertInto(
        'workout_set',
        {
          session_exercise_id: sessionExerciseId,
          session_id: parent.session_id,
          exercise_id: parent.exercise_id,
          set_index: indexRow?.next ?? 1,
          set_type: values.setType,
          parent_set_id: null,
          weight_kg: values.weightKg,
          reps: values.reps,
          duration_seconds: values.durationSeconds,
          distance_m: values.distanceM,
          rpe: values.rpe,
          is_completed: boolToSql(false),
          completed_at: null,
          performed_at: now,
          note: seed.note ?? null,
        },
        t,
      );
      await this.touchActiveState(parent.session_id, t);
      return this.requireSet(id, t);
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  async addDropSet(parentSetId: EntityId, seed: SetSeed, tx?: SqlExecutor): Promise<WorkoutSet> {
    const runner = async (t: SqlExecutor): Promise<WorkoutSet> => {
      const parentRow = await t.selectOne<WorkoutSetRow>(
        'SELECT * FROM workout_set WHERE id = ? AND deleted_at IS NULL',
        [parentSetId],
      );
      if (!parentRow) {
        throw new RepositoryNotFoundError('workout_set', parentSetId);
      }
      if (parentRow.parent_set_id !== null) {
        throw new DropSetParentInvalidError(parentSetId);
      }

      // Pre-fill from the tail of the chain rather than the parent, so a second
      // drop starts from the first drop's numbers - the values a user is about
      // to lower again.
      const lastSegment = await t.selectOne<WorkoutSetRow>(
        `SELECT * FROM workout_set WHERE parent_set_id = ? AND deleted_at IS NULL
         ORDER BY created_at DESC, id DESC LIMIT 1`,
        [parentSetId],
      );
      const source = lastSegment ?? parentRow;
      const values = applySeed(
        {
          setType: 'drop',
          weightKg: source.weight_kg,
          reps: source.reps,
          durationSeconds: source.duration_seconds,
          distanceM: source.distance_m,
          rpe: null,
        },
        { ...seed, setType: 'drop' },
      );

      const { id } = await this.insertInto(
        'workout_set',
        {
          session_exercise_id: parentRow.session_exercise_id,
          session_id: parentRow.session_id,
          exercise_id: parentRow.exercise_id,
          // ADR-0006: a drop segment shares its parent's set_index; the index is
          // never incremented for one.
          set_index: parentRow.set_index,
          set_type: 'drop',
          parent_set_id: parentSetId,
          weight_kg: values.weightKg,
          reps: values.reps,
          duration_seconds: values.durationSeconds,
          distance_m: values.distanceM,
          rpe: values.rpe,
          is_completed: boolToSql(false),
          completed_at: null,
          performed_at: this.now(),
          note: seed.note ?? null,
        },
        t,
      );
      await this.touchActiveState(parentRow.session_id, t);
      return this.requireSet(id, t);
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  async updateSet(setId: EntityId, patch: UpdateSetPatch, tx?: SqlExecutor): Promise<WorkoutSet> {
    const runner = async (t: SqlExecutor): Promise<WorkoutSet> => {
      const row = await t.selectOne<WorkoutSetRow>(
        'SELECT * FROM workout_set WHERE id = ? AND deleted_at IS NULL',
        [setId],
      );
      if (!row) {
        throw new RepositoryNotFoundError('workout_set', setId);
      }
      if (patch.setType !== undefined && row.parent_set_id !== null && patch.setType !== 'drop') {
        throw new DropSegmentSetTypeError(setId);
      }

      const columns = setValueColumns(patch);
      if (Object.keys(columns).length > 0) {
        await this.updateRowIn('workout_set', setId, columns, t);
      }
      await this.touchActiveState(row.session_id, t);
      return this.requireSet(setId, t);
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  async completeSet(
    setId: EntityId,
    values: CompleteSetValues,
    tx?: SqlExecutor,
  ): Promise<CompletedSetResult> {
    const runner = async (t: SqlExecutor): Promise<CompletedSetResult> => {
      const row = await t.selectOne<WorkoutSetRow>(
        'SELECT * FROM workout_set WHERE id = ? AND deleted_at IS NULL',
        [setId],
      );
      if (!row) {
        throw new RepositoryNotFoundError('workout_set', setId);
      }

      const completedAt = values.completedAt ?? this.now();
      await this.updateRowIn(
        'workout_set',
        setId,
        {
          ...setValueColumns(values),
          is_completed: boolToSql(true),
          completed_at: completedAt,
          // `performed_at` is the ordering key every history and
          // previous-performance query uses (`ix_set_exercise_time`), so it is
          // re-anchored to the moment the set was actually completed, not to
          // whenever the empty row happened to be appended.
          performed_at: completedAt,
        },
        t,
      );
      await this.touchActiveState(row.session_id, t);

      // Personal-record evaluation belongs in this transaction (ARCHITECTURE.md
      // section 5.1) and lands here in P8. Nothing is stubbed for it now.
      return { set: await this.requireSet(setId, t), newPRs: [] };
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  async uncompleteSet(setId: EntityId, tx?: SqlExecutor): Promise<WorkoutSet> {
    const runner = async (t: SqlExecutor): Promise<WorkoutSet> => {
      const row = await t.selectOne<{ session_id: string }>(
        'SELECT session_id FROM workout_set WHERE id = ? AND deleted_at IS NULL',
        [setId],
      );
      if (!row) {
        throw new RepositoryNotFoundError('workout_set', setId);
      }
      await this.updateRowIn(
        'workout_set',
        setId,
        { is_completed: boolToSql(false), completed_at: null },
        t,
      );
      await this.touchActiveState(row.session_id, t);
      return this.requireSet(setId, t);
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  /** Soft-deletes the set and, when it is a parent, its drop segments - the same cascade-and-match-on-`deleted_at` mechanism `removeExercise` documents. */
  async deleteSet(setId: EntityId, tx?: SqlExecutor): Promise<void> {
    const runner = async (t: SqlExecutor): Promise<void> => {
      const row = await t.selectOne<{
        session_id: string;
        parent_set_id: string | null;
        deleted_at: number | null;
      }>('SELECT session_id, parent_set_id, deleted_at FROM workout_set WHERE id = ?', [setId]);
      if (!row) {
        throw new RepositoryNotFoundError('workout_set', setId);
      }
      if (row.deleted_at !== null) {
        return;
      }
      const now = this.now();
      await t.run(
        'UPDATE workout_set SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
        [now, now, setId],
      );
      if (row.parent_set_id === null) {
        await t.run(
          'UPDATE workout_set SET deleted_at = ?, updated_at = ? WHERE parent_set_id = ? AND deleted_at IS NULL',
          [now, now, setId],
        );
      }
      await this.touchActiveState(row.session_id, t);
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  async restoreSet(setId: EntityId, tx?: SqlExecutor): Promise<void> {
    const runner = async (t: SqlExecutor): Promise<void> => {
      const row = await t.selectOne<{
        session_id: string;
        parent_set_id: string | null;
        deleted_at: number | null;
      }>('SELECT session_id, parent_set_id, deleted_at FROM workout_set WHERE id = ?', [setId]);
      if (!row) {
        throw new RepositoryNotFoundError('workout_set', setId);
      }
      if (row.deleted_at === null) {
        return;
      }
      const now = this.now();
      await t.run('UPDATE workout_set SET deleted_at = NULL, updated_at = ? WHERE id = ?', [
        now,
        setId,
      ]);
      if (row.parent_set_id === null) {
        await t.run(
          'UPDATE workout_set SET deleted_at = NULL, updated_at = ? WHERE parent_set_id = ? AND deleted_at = ?',
          [now, setId, row.deleted_at],
        );
      }
      await this.touchActiveState(row.session_id, t);
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  // --- active state -------------------------------------------------------------

  async saveActiveState(patch: ActiveStatePatch, tx?: SqlExecutor): Promise<void> {
    const runner = async (t: SqlExecutor): Promise<void> => {
      const columns: Record<string, SqlParam> = {};
      if (patch.focusedSessionExerciseId !== undefined) {
        columns.focused_session_exercise_id = patch.focusedSessionExerciseId;
      }
      if (patch.scrollOffset !== undefined) {
        columns.scroll_offset = patch.scrollOffset;
      }
      if (patch.timerDeadlineAt !== undefined) {
        columns.timer_deadline_at = patch.timerDeadlineAt;
      }
      if (patch.timerTotalSeconds !== undefined) {
        columns.timer_total_seconds = patch.timerTotalSeconds;
      }
      if (patch.timerNotificationId !== undefined) {
        columns.timer_notification_id = patch.timerNotificationId;
      }

      const now = this.now();
      const entries: [string, SqlParam][] = [
        ['session_id', patch.sessionId],
        ...Object.entries(columns),
        ['updated_at', now],
      ];
      const names = entries.map(([name]) => name);
      const assignments = names
        .filter((name) => name !== 'session_id')
        .map((name) => `${name} = excluded.${name}`)
        .join(', ');

      await t.run(
        `INSERT INTO active_session_state (${names.join(', ')})
         VALUES (${names.map(() => '?').join(', ')})
         ON CONFLICT(session_id) DO UPDATE SET ${assignments}`,
        entries.map(([, value]) => value),
      );
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  // --- loading ------------------------------------------------------------------

  private async loadAggregate(
    row: WorkoutSessionRow,
    executor: SqlExecutor,
  ): Promise<ActiveSessionAggregate> {
    const exerciseRows = await executor.select<SessionExerciseRow>(
      'SELECT * FROM session_exercise WHERE session_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC, created_at ASC',
      [row.id],
    );
    const setRows = await executor.select<WorkoutSetRow>(
      `SELECT ws.* FROM workout_set ws
       JOIN session_exercise se ON se.id = ws.session_exercise_id
       WHERE ws.session_id = ? AND ws.deleted_at IS NULL AND se.deleted_at IS NULL
       ORDER BY ws.set_index ASC, ws.parent_set_id IS NOT NULL ASC, ws.created_at ASC`,
      [row.id],
    );
    const summaries = await this.loadExerciseSummaries(
      [...new Set(exerciseRows.map((r) => r.exercise_id))],
      executor,
    );
    const stateRow = await executor.selectOne<ActiveSessionStateRow>(
      'SELECT * FROM active_session_state WHERE session_id = ?',
      [row.id],
    );

    const setsByExercise = new Map<string, WorkoutSet[]>();
    for (const setRow of setRows) {
      const list = setsByExercise.get(setRow.session_exercise_id) ?? [];
      list.push(mapSetRow(setRow));
      setsByExercise.set(setRow.session_exercise_id, list);
    }

    const shell = this.mapRow(row);
    return {
      ...shell,
      exercises: exerciseRows.map((exerciseRow) =>
        this.mapSessionExerciseRow(
          exerciseRow,
          summaries,
          setsByExercise.get(exerciseRow.id) ?? [],
        ),
      ),
      activeState: stateRow ? mapActiveStateRow(stateRow) : shell.activeState,
    };
  }

  private async loadSessionExercise(
    id: EntityId,
    executor: SqlExecutor,
  ): Promise<SessionExercise | null> {
    const row = await executor.selectOne<SessionExerciseRow>(
      'SELECT * FROM session_exercise WHERE id = ? AND deleted_at IS NULL',
      [id],
    );
    if (!row) {
      return null;
    }
    const setRows = await executor.select<WorkoutSetRow>(
      `SELECT * FROM workout_set WHERE session_exercise_id = ? AND deleted_at IS NULL
       ORDER BY set_index ASC, parent_set_id IS NOT NULL ASC, created_at ASC`,
      [id],
    );
    const summaries = await this.loadExerciseSummaries([row.exercise_id], executor);
    return this.mapSessionExerciseRow(row, summaries, setRows.map(mapSetRow));
  }

  private mapSessionExerciseRow(
    row: SessionExerciseRow,
    summaries: Map<string, ExerciseListItem>,
    sets: WorkoutSet[],
  ): SessionExercise {
    const exercise = summaries.get(row.exercise_id);
    if (!exercise) {
      throw new Error(
        `unreachable: session_exercise "${row.id}" references missing exercise "${row.exercise_id}"`,
      );
    }
    return {
      id: row.id,
      sessionId: row.session_id,
      exerciseId: row.exercise_id,
      exerciseNameSnapshot: row.exercise_name_snapshot,
      sortOrder: row.sort_order,
      supersetGroup: row.superset_group,
      restSecondsOverride: row.rest_seconds_override,
      note: row.note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      exercise,
      sets,
    };
  }

  /** Same query and same non-filtering-on-`deleted_at` reasoning as `SqlitePlanRepository.loadExerciseSummaries`. */
  private async loadExerciseSummaries(
    exerciseIds: readonly EntityId[],
    executor: SqlExecutor,
  ): Promise<Map<string, ExerciseListItem>> {
    const map = new Map<string, ExerciseListItem>();
    if (exerciseIds.length === 0) {
      return map;
    }
    const placeholders = exerciseIds.map(() => '?').join(', ');
    const rows = await executor.select<ExerciseSummaryRow>(
      `SELECT e.id, e.source, e.catalog_slug, e.name_en, e.name_pl, e.level, e.equipment_slug, e.body_part,
              e.tracking_type, e.images,
              COALESCE(ud.is_favorite, 0) AS ud_is_favorite, ud.display_name_override AS ud_display_name_override
       FROM exercise e
       LEFT JOIN exercise_user_data ud ON ud.exercise_id = e.id
       WHERE e.id IN (${placeholders})`,
      [...exerciseIds],
    );
    for (const row of rows) {
      map.set(row.id, mapExerciseSummaryRow(row));
    }
    return map;
  }

  private async requireAggregate(
    sessionId: EntityId,
    executor: SqlExecutor,
  ): Promise<ActiveSessionAggregate> {
    const row = await executor.selectOne<WorkoutSessionRow>(
      'SELECT * FROM workout_session WHERE id = ?',
      [sessionId],
    );
    if (!row) {
      throw new Error('unreachable: workout_session row was just inserted');
    }
    return this.loadAggregate(row, executor);
  }

  private async requireSet(setId: EntityId, executor: SqlExecutor): Promise<WorkoutSet> {
    const row = await executor.selectOne<WorkoutSetRow>('SELECT * FROM workout_set WHERE id = ?', [
      setId,
    ]);
    if (!row) {
      throw new RepositoryNotFoundError('workout_set', setId);
    }
    return mapSetRow(row);
  }

  private async requireInProgressSession(
    sessionId: EntityId,
    executor: SqlExecutor,
  ): Promise<WorkoutSessionRow> {
    const row = await executor.selectOne<WorkoutSessionRow>(
      'SELECT * FROM workout_session WHERE id = ? AND deleted_at IS NULL',
      [sessionId],
    );
    if (!row) {
      throw new RepositoryNotFoundError('workout_session', sessionId);
    }
    if (row.status !== 'in_progress') {
      throw new SessionNotInProgressError(sessionId, row.status);
    }
    return row;
  }

  // --- write mechanics ----------------------------------------------------------

  /**
   * Inserts the `workout_session` row plus its `active_session_state` row.
   * `local_date`/`tz_offset_minutes` are computed from `startedAt` through the
   * injected `Clock` and frozen there (ADR-0002 decision 2).
   *
   * The `ux_session_single_in_progress` violation is caught here as well as
   * pre-checked by `assertNoSessionInProgress`: the pre-check gives a precise
   * error with the existing session's id, and this catch is what guarantees a
   * raw SQLite constraint message can never escape to the service layer if two
   * starts ever interleave.
   */
  private async insertSession(
    columns: Record<string, SqlParam>,
    startedAt: number,
    tx: SqlExecutor,
  ): Promise<EntityId> {
    try {
      const { id } = await this.insertRow(
        {
          ...columns,
          status: 'in_progress',
          started_at: startedAt,
          tz_offset_minutes: this.deps.clock.timezoneOffsetMinutes(startedAt),
          paused_ms: 0,
        },
        tx,
        { localDate: this.localDate(startedAt) },
      );
      await tx.run('INSERT INTO active_session_state (session_id, updated_at) VALUES (?, ?)', [
        id,
        this.now(),
      ]);
      return id;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new SessionAlreadyInProgressError(await this.findInProgressId(tx));
      }
      throw error;
    }
  }

  private async assertNoSessionInProgress(executor: SqlExecutor): Promise<void> {
    const existingId = await this.findInProgressId(executor);
    if (existingId !== null) {
      throw new SessionAlreadyInProgressError(existingId);
    }
  }

  /**
   * Deliberately does not filter on `deleted_at`: `ux_session_single_in_progress`
   * is `ON workout_session (status) WHERE status = 'in_progress'` with no
   * soft-delete predicate, so a soft-deleted in-progress row still blocks a new
   * start and must still be reported as the blocker.
   */
  private async findInProgressId(executor: SqlExecutor): Promise<EntityId | null> {
    const row = await executor.selectOne<{ id: string }>(
      "SELECT id FROM workout_session WHERE status = 'in_progress' LIMIT 1",
    );
    return row?.id ?? null;
  }

  /** ADR-0005 mechanism 4: `active_session_state` tracks the workout screen, so every mutation that changes what it shows re-stamps it inside the same transaction. */
  private async touchActiveState(sessionId: EntityId, tx: SqlExecutor): Promise<void> {
    await tx.run('UPDATE active_session_state SET updated_at = ? WHERE session_id = ?', [
      this.now(),
      sessionId,
    ]);
  }

  private async deleteActiveState(sessionId: EntityId, tx: SqlExecutor): Promise<void> {
    await tx.run('DELETE FROM active_session_state WHERE session_id = ?', [sessionId]);
  }

  /**
   * FR-11's pre-fill chain, in order:
   *
   * 1. This exercise's previous (non-drop, non-deleted) set in this session -
   *    including its `set_type`, so a second warm-up stays a warm-up.
   * 2. Its last completed working set in a previous *completed* session, by
   *    `performed_at`. Weight and reps only: `set_type` resets to `normal`,
   *    because carrying a `failure` marker across workouts would label a set the
   *    user has not taken to failure yet.
   * 3. Empty.
   */
  private async resolvePrefill(
    sessionExerciseId: EntityId,
    parent: { session_id: string; exercise_id: string },
    executor: SqlExecutor,
  ): Promise<SetPrefill> {
    const previousInSession = await executor.selectOne<WorkoutSetRow>(
      `SELECT * FROM workout_set
       WHERE session_exercise_id = ? AND deleted_at IS NULL AND parent_set_id IS NULL
       ORDER BY set_index DESC, created_at DESC LIMIT 1`,
      [sessionExerciseId],
    );
    if (previousInSession) {
      return {
        setType: previousInSession.set_type,
        weightKg: previousInSession.weight_kg,
        reps: previousInSession.reps,
        durationSeconds: previousInSession.duration_seconds,
        distanceM: previousInSession.distance_m,
        rpe: null,
      };
    }

    const previousSession = await executor.selectOne<WorkoutSetRow>(
      `SELECT ws.* FROM workout_set ws
       JOIN workout_session s ON s.id = ws.session_id
       WHERE ws.exercise_id = ? AND ws.session_id <> ? AND ws.deleted_at IS NULL
         AND ws.is_completed = 1 AND ws.parent_set_id IS NULL
         AND ws.set_type IN ${PREFILLABLE_SET_TYPES}
         AND s.deleted_at IS NULL AND s.status = 'completed'
       ORDER BY ws.performed_at DESC LIMIT 1`,
      [parent.exercise_id, parent.session_id],
    );
    if (previousSession) {
      return {
        setType: 'normal',
        weightKg: previousSession.weight_kg,
        reps: previousSession.reps,
        durationSeconds: previousSession.duration_seconds,
        distanceM: previousSession.distance_m,
        rpe: null,
      };
    }

    return EMPTY_PREFILL;
  }

  // --- table-parameterized mechanics for session_exercise/workout_set ------------
  // The same small equivalents of BaseSqliteRepository's insertRow/updateRow that
  // SqlitePlanRepository needed for its own child tables, and for the same reason:
  // the base class is hardwired to `this.table` ('workout_session'). Every `table`
  // argument is one of this file's own literals, never caller input.

  private async insertInto(
    table: SessionChildTable,
    columns: Record<string, SqlParam>,
    tx: SqlExecutor,
    at?: number,
  ): Promise<{ id: string }> {
    const id = this.generateId();
    const now = at ?? this.now();
    const entries: [string, SqlParam][] = [
      ['id', id],
      ...Object.entries(columns),
      ['created_at', now],
      ['updated_at', now],
    ];
    const names = entries.map(([name]) => name);
    await tx.run(
      `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
      entries.map(([, value]) => value),
    );
    return { id };
  }

  private async updateRowIn(
    table: SessionChildTable,
    id: EntityId,
    columns: Record<string, SqlParam>,
    executor: SqlExecutor,
  ): Promise<void> {
    const entries: [string, SqlParam][] = [...Object.entries(columns), ['updated_at', this.now()]];
    const assignments = entries.map(([name]) => `${name} = ?`).join(', ');
    const result = await executor.run(
      `UPDATE ${table} SET ${assignments} WHERE id = ? AND deleted_at IS NULL`,
      [...entries.map(([, value]) => value), id],
    );
    if (result.changes === 0) {
      throw new RepositoryNotFoundError(table, id);
    }
  }
}

/** Seed fields that are present (including an explicit `null`) win over the pre-fill; absent ones keep it. `exactOptionalPropertyTypes` makes `!== undefined` an accurate "was it provided" test here. */
function applySeed(prefill: SetPrefill, seed: SetSeed): SetPrefill {
  return {
    setType: seed.setType ?? prefill.setType,
    weightKg: seed.weightKg !== undefined ? seed.weightKg : prefill.weightKg,
    reps: seed.reps !== undefined ? seed.reps : prefill.reps,
    durationSeconds:
      seed.durationSeconds !== undefined ? seed.durationSeconds : prefill.durationSeconds,
    distanceM: seed.distanceM !== undefined ? seed.distanceM : prefill.distanceM,
    rpe: seed.rpe !== undefined ? seed.rpe : prefill.rpe,
  };
}

/** The `workout_set` value columns shared by `updateSet` and `completeSet`, mapped only for the fields actually present on the patch. */
function setValueColumns(patch: UpdateSetPatch | CompleteSetValues): Record<string, SqlParam> {
  const columns: Record<string, SqlParam> = {};
  if ('setType' in patch && patch.setType !== undefined) columns.set_type = patch.setType;
  if (patch.weightKg !== undefined) columns.weight_kg = patch.weightKg;
  if (patch.reps !== undefined) columns.reps = patch.reps;
  if (patch.durationSeconds !== undefined) columns.duration_seconds = patch.durationSeconds;
  if (patch.distanceM !== undefined) columns.distance_m = patch.distanceM;
  if (patch.rpe !== undefined) columns.rpe = patch.rpe;
  if (patch.note !== undefined) columns.note = patch.note;
  return columns;
}
