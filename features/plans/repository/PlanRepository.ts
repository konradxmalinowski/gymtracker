import type { SqlExecutor } from '@/repositories/contracts/database';
import type { EntityId } from '@/repositories/contracts/repository';
import type { ExerciseListItem } from '@/features/exercise-library';

/**
 * A day's exercise, with a full `ExerciseListItem` (from `exercise-library`,
 * imported through its public barrel per ARCHITECTURE.md section 3.1 rule 4 -
 * `plans` is allowed to depend on `exercise-library`, never the reverse)
 * embedded rather than a bare `exerciseId` - this is what lets the plan-day
 * editor render a row (name, image, favorite state, ...) without a second
 * round trip per this phase's task brief.
 */
export interface PlanDayExercise {
  id: EntityId;
  planDayId: EntityId;
  exerciseId: EntityId;
  sortOrder: number;
  targetSets: number | null;
  targetRepMin: number | null;
  targetRepMax: number | null;
  targetRpe: number | null;
  restSeconds: number | null;
  /** `NULL` = standalone; equal values within the same day = supersetted together. Written only via `setSupersetGroup`. */
  supersetGroup: number | null;
  note: string | null;
  createdAt: number;
  updatedAt: number;
  exercise: ExerciseListItem;
}

export interface PlanDay {
  id: EntityId;
  planId: EntityId;
  name: string;
  note: string | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  exercises: PlanDayExercise[];
}

/** Full detail-view shape: `plan` plus its `days`, each hydrated with its `exercises`. */
export interface PlanAggregate {
  id: EntityId;
  name: string;
  description: string | null;
  color: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  days: PlanDay[];
}

/** Lighter shape for `listPlans()` - ARCHITECTURE.md section 8.3 ("with day counts"). */
export interface PlanListItem {
  id: EntityId;
  name: string;
  description: string | null;
  color: string | null;
  isActive: boolean;
  sortOrder: number;
  dayCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface CreatePlanInput {
  name: string;
  description?: string | null;
  color?: string | null;
}

export interface AddPlanDayInput {
  name: string;
  note?: string | null;
}

export interface AddPlanDayExerciseInput {
  exerciseId: EntityId;
  targetSets?: number | null;
  targetRepMin?: number | null;
  targetRepMax?: number | null;
  targetRpe?: number | null;
  restSeconds?: number | null;
  note?: string | null;
}

/**
 * Every field optional except `exerciseId`, which is deliberately absent
 * entirely (not just optional) - a day-exercise's target `exercise_id` is
 * fixed at creation; swapping which exercise a slot points to is a
 * remove-then-add in the UI, not an update. `supersetGroup` is likewise
 * excluded here on purpose: it has its own dedicated writer
 * (`setSupersetGroup`) with its own same-day invariant, and letting two
 * different methods write the same column would make that invariant easy to
 * bypass by accident.
 */
export type UpdatePlanDayExercisePatch = Partial<Omit<AddPlanDayExerciseInput, 'exerciseId'>>;

/**
 * `PlanRepository` (feature: `plans`) - aggregate root, ARCHITECTURE.md
 * section 8.3. The whole plan + its days + their exercises is one aggregate;
 * every mutating method below runs in one transaction (joining a
 * caller-supplied `tx` when given, per section 8.2's composition pattern -
 * see every method's optional trailing `tx` parameter).
 *
 * The 17 methods named in ARCHITECTURE.md section 8.3 are all present below,
 * unchanged in name or shape. Three additions beyond that literal list, for
 * the same reason `ExerciseRepository` added `deleteCustom` beyond its own
 * 10-method doc list - the specified contract has no way to delete a plan at
 * all, which both a normal "delete this plan" user action and this phase's
 * required session-snapshot test (which needs a genuine hard delete to
 * observe `workout_session`'s `ON DELETE SET NULL` firing) need:
 *
 * - `deletePlan` / `restorePlan` - soft delete/undo, the normal user-facing path.
 * - `purgePlan` - hard delete. Mirrors `WriteRepository.purge` (section 8.2,
 *   "hard delete, explicit only"); triggers `plan_day`'s `ON DELETE CASCADE`
 *   and `workout_session.plan_id`/`plan_day_id`'s `ON DELETE SET NULL`.
 */
export interface PlanRepository {
  /** With day counts. */
  listPlans(tx?: SqlExecutor): Promise<PlanListItem[]>;
  /** Plan + days + day exercises + exercise summaries. */
  getPlan(id: EntityId, tx?: SqlExecutor): Promise<PlanAggregate | null>;
  createPlan(input: CreatePlanInput, tx?: SqlExecutor): Promise<PlanAggregate>;
  renamePlan(id: EntityId, name: string, tx?: SqlExecutor): Promise<void>;
  /** Deep copy: new ids for every plan/day/day-exercise row, `name + " (copy)"`. Same-name disambiguation ("(copy 2)", ...) is not done here - see the implementation's doc comment. */
  duplicatePlan(id: EntityId, tx?: SqlExecutor): Promise<PlanAggregate>;
  /** Clears the previous active plan's `is_active` and sets the new one's, in the same transaction - `ux_plan_single_active` is never violated even transiently. */
  setActivePlan(id: EntityId, tx?: SqlExecutor): Promise<void>;
  reorderPlans(orderedIds: readonly EntityId[], tx?: SqlExecutor): Promise<void>;
  addDay(planId: EntityId, input: AddPlanDayInput, tx?: SqlExecutor): Promise<PlanDay>;
  renameDay(dayId: EntityId, name: string, tx?: SqlExecutor): Promise<void>;
  /** Deep copy within the same plan: new ids for the day and every one of its day-exercises. */
  duplicateDay(dayId: EntityId, tx?: SqlExecutor): Promise<PlanDay>;
  /** Soft delete - feeds the day-level undo toast (docs/ARCHITECTURE.md nav rules: "delete-plus-undo-toast" for everything below plan level). */
  deleteDay(dayId: EntityId, tx?: SqlExecutor): Promise<void>;
  /** Undoes `deleteDay` - the undo toast's call target. */
  restoreDay(dayId: EntityId, tx?: SqlExecutor): Promise<void>;
  reorderDays(planId: EntityId, orderedDayIds: readonly EntityId[], tx?: SqlExecutor): Promise<void>;
  addExerciseToDay(
    dayId: EntityId,
    input: AddPlanDayExerciseInput,
    tx?: SqlExecutor,
  ): Promise<PlanDayExercise>;
  updateDayExercise(
    id: EntityId,
    patch: UpdatePlanDayExercisePatch,
    tx?: SqlExecutor,
  ): Promise<PlanDayExercise>;
  /** Soft delete - feeds the day-exercise-level undo toast (same nav-rules reasoning as `deleteDay`/`restoreDay`). */
  removeExerciseFromDay(id: EntityId, tx?: SqlExecutor): Promise<void>;
  /** Undoes `removeExerciseFromDay` - the undo toast's call target. */
  restoreDayExercise(id: EntityId, tx?: SqlExecutor): Promise<void>;
  reorderDayExercises(dayId: EntityId, orderedIds: readonly EntityId[], tx?: SqlExecutor): Promise<void>;
  /**
   * Writes `superset_group` on every listed `plan_day_exercise` id in one
   * transaction. Does not enforce "at least 2 exercises" (that's
   * `PlanService`'s job); does enforce, and throw
   * {@link SupersetSpansMultipleDaysError} on, every id belonging to the
   * same `plan_day` - see this interface's own doc comment.
   */
  setSupersetGroup(
    dayExerciseIds: readonly EntityId[],
    group: number | null,
    tx?: SqlExecutor,
  ): Promise<void>;
  /** Soft delete - the normal "delete this plan" user action. */
  deletePlan(id: EntityId, tx?: SqlExecutor): Promise<void>;
  /** Undoes `deletePlan`. */
  restorePlan(id: EntityId, tx?: SqlExecutor): Promise<void>;
  /** Hard delete. See this interface's own doc comment for why this exists beyond the literal ARCHITECTURE.md list. */
  purgePlan(id: EntityId, tx?: SqlExecutor): Promise<void>;
}
