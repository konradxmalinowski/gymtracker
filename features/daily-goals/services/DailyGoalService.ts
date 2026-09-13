import { z } from 'zod';
import type { EntityId } from '@/repositories/contracts/repository';
import { isWeekdayActive, weekdayIndexOf } from '../domain/weekdayBitmask';
import type {
  DailyGoal,
  DailyGoalEntry,
  DailyGoalWithTodayEntry,
  GoalType,
} from '../types/DailyGoal';
import type {
  CreateDailyGoalInput,
  DailyGoalRepository,
  UpdateDailyGoalPatch,
} from '../repository/DailyGoalRepository';
import { DailyGoalValidationError } from './errors';

/** No existing convention specific to this feature - sized the same as `PLAN_NAME_MAX_LENGTH`, the same rough shape (a short, user-typed label). */
export const DAILY_GOAL_NAME_MAX_LENGTH = 100;
/** Ionicons name - short, curated-picker-selected (`database/schema.sql`'s own column comment), never free-typed prose. */
export const DAILY_GOAL_ICON_MAX_LENGTH = 50;
/** Free-text unit label ('kroki', 'ml', 'min') - short by nature, generous ceiling regardless. */
export const DAILY_GOAL_UNIT_MAX_LENGTH = 20;

const GOAL_TYPES: readonly GoalType[] = ['boolean', 'counter', 'numeric'];

/** `daily_goal.target_value` CHECK constraint: `target_value IS NULL OR target_value > 0`. */
const targetValueSchema = z.number().finite().positive();
/** `daily_goal.active_weekdays` CHECK constraint: `active_weekdays BETWEEN 1 AND 127`. */
const activeWeekdaysSchema = z.number().int().min(1).max(127);

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Goal name is required.')
  .max(DAILY_GOAL_NAME_MAX_LENGTH);
const iconSchema = z.string().trim().min(1).max(DAILY_GOAL_ICON_MAX_LENGTH).nullish();
const unitSchema = z.string().trim().min(1).max(DAILY_GOAL_UNIT_MAX_LENGTH).nullish();

/**
 * `daily_goal`'s own `CHECK (goal_type = 'boolean' OR target_value IS NOT
 * NULL)` - enforced here on the full `CreateDailyGoalInput` shape, where
 * `goalType` is always present. Not re-enforced on `UpdateDailyGoalPatch`
 * (see {@link updateGoalSchema}'s own comment) - a partial patch cannot know
 * the goal's *current* `goalType` without a repository read this service
 * layer deliberately doesn't do just to validate, so an update that would
 * leave the row in a `goal_type`/`target_value`-inconsistent state still
 * surfaces as a real, useful error - just from the database's own CHECK
 * constraint at write time, not from this Zod layer.
 */
function targetValueMatchesGoalType(input: {
  goalType: GoalType;
  targetValue?: number | null | undefined;
}): boolean {
  if (input.goalType === 'boolean') {
    return true;
  }
  return input.targetValue != null;
}

const createGoalSchema = z
  .object({
    name: nameSchema,
    icon: iconSchema,
    goalType: z.enum(GOAL_TYPES as [GoalType, ...GoalType[]]),
    targetValue: targetValueSchema.nullish(),
    unit: unitSchema,
    activeWeekdays: activeWeekdaysSchema,
  })
  .refine(targetValueMatchesGoalType, {
    message: 'targetValue is required for counter/numeric goals.',
    path: ['targetValue'],
  });

/**
 * Every field optional (a patch), each checked only on its own terms when
 * present - see {@link targetValueMatchesGoalType}'s doc comment for why the
 * cross-field `goalType`/`targetValue` relationship is not re-checked here.
 */
const updateGoalSchema = z.object({
  name: nameSchema.optional(),
  icon: iconSchema,
  goalType: z.enum(GOAL_TYPES as [GoalType, ...GoalType[]]).optional(),
  targetValue: targetValueSchema.nullish(),
  unit: unitSchema,
  activeWeekdays: activeWeekdaysSchema.optional(),
});

/**
 * Validation-only counterpart to a `parse*` helper - same
 * `exactOptionalPropertyTypes` mismatch `PlanService.checkWithSchema()`/
 * `BodyMetricService`'s own `checkWithSchema()` document: an object with
 * optional fields, once round-tripped through Zod's own inferred output
 * type, is not assignable back to this file's own input types. On success
 * the original object is passed straight through to the repository
 * unchanged; only failure needs the parsed Zod issues.
 */
function checkWithSchema(schema: z.ZodTypeAny, input: unknown): void {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new DailyGoalValidationError(result.error.issues);
  }
}

export interface DailyGoalServiceDependencies {
  repository: DailyGoalRepository;
}

/**
 * The only door into `DailyGoalRepository` (ARCHITECTURE.md section 3.1,
 * rule 3 - presentation never touches a repository directly).
 */
export class DailyGoalService {
  constructor(private readonly deps: DailyGoalServiceDependencies) {}

  /** @throws {DailyGoalValidationError} */
  async createGoal(input: CreateDailyGoalInput): Promise<DailyGoal> {
    checkWithSchema(createGoalSchema, input);
    return this.deps.repository.create(input);
  }

  /** @throws {DailyGoalValidationError} */
  async updateGoal(id: EntityId, patch: UpdateDailyGoalPatch): Promise<DailyGoal> {
    checkWithSchema(updateGoalSchema, patch);
    return this.deps.repository.update(id, patch);
  }

  /**
   * Hard delete, matching `PlanService.deletePlan()`/`purgePlan()` and
   * `WorkoutSessionService.deleteSession()`'s own precedent for "delete a
   * whole top-level, standalone object" (a `ConfirmDialog`-gated, no-undo UI
   * action) rather than the soft-delete-plus-undo-toast treatment this
   * codebase reserves for a *sub-item* one level down inside some other
   * aggregate (a plan day, a plan day's exercise). A `daily_goal` is not a
   * sub-item of anything - it's the top-level object itself, the same shape
   * as a `plan` or a `workout_session`.
   *
   * This distinction is not stylistic: `ON DELETE CASCADE` (this goal's own
   * `daily_goal_entry` history) and `ON DELETE SET NULL` (any
   * `daily_reminder.goal_id` pointing at this goal, degrading it to
   * standalone) are SQLite FK triggers that only fire on a real
   * `DELETE FROM`, never on a soft-delete `UPDATE deleted_at` - so a soft
   * delete here would silently violate this feature's own acceptance
   * criterion ("deleting a goal degrades any reminder pointing at it to
   * standalone rather than deleting the reminder", `docs/ROADMAP.md` P17):
   * the reminder would keep pointing at an invisible, soft-deleted goal
   * instead. Calling `purge()` is what actually fires both triggers, so a
   * goal's history (`daily_goal_entry`) is deliberately NOT preserved after a
   * genuine delete, consistent with the schema's own `ON DELETE CASCADE`
   * definition (`docs/ARCHITECTURE.md` section 7.12) rather than a bug.
   *
   * `softDelete`/`restore` stay available on the repository (inherited from
   * `BaseSqliteRepository`, whose `AuditedRow` shape requires a `deleted_at`
   * column) but are not wired to any reachable service method - there is no
   * real "undo a goal delete" flow, since undoing a purge is not possible and
   * this feature never calls `softDelete` in the first place. `setEnabled`
   * above is this feature's actual "hide without losing history" affordance
   * (`docs/ROADMAP.md`'s own "disabling a goal removes it from the daily view
   * immediately but keeps its history intact" acceptance line) - delete is a
   * separate, deliberately irreversible action.
   */
  deleteGoal(id: EntityId): Promise<void> {
    return this.deps.repository.purge(id);
  }

  setEnabled(id: EntityId, isEnabled: boolean): Promise<void> {
    return this.deps.repository.setEnabled(id, isEnabled);
  }

  reorder(orderedIds: readonly EntityId[]): Promise<void> {
    return this.deps.repository.reorder(orderedIds);
  }

  listAllGoals(): Promise<DailyGoal[]> {
    return this.deps.repository.listAll();
  }

  /** Every enabled goal active on `localDate`'s weekday, each paired with its entry for that date if one exists - `weekdayIndexOf()` derives the weekday from `localDate` itself, so callers only ever pass the date. */
  listTodaysGoals(localDate: string): Promise<DailyGoalWithTodayEntry[]> {
    return this.deps.repository.listActiveGoalsForWeekday(localDate, weekdayIndexOf(localDate));
  }

  /** @throws {DailyGoalValidationError} when `progressValue` is negative or non-finite. */
  async recordProgress(
    goalId: EntityId,
    localDate: string,
    progressValue: number,
  ): Promise<DailyGoalEntry> {
    checkWithSchema(z.number().finite().nonnegative(), progressValue);
    return this.deps.repository.upsertEntryForToday(goalId, localDate, progressValue);
  }

  getEntryHistory(
    goalId: EntityId,
    dateRangeFrom: string,
    dateRangeTo: string,
  ): Promise<DailyGoalEntry[]> {
    return this.deps.repository.listEntryHistory(goalId, dateRangeFrom, dateRangeTo);
  }

  /** Re-exported so a caller (e.g. `NotificationScheduler`'s "Zrealizowane" handler) can check "is this goal active today" without importing `domain/weekdayBitmask.ts` directly through a non-barrel path. */
  isActiveOn(goal: Pick<DailyGoal, 'activeWeekdays'>, localDate: string): boolean {
    return isWeekdayActive(goal.activeWeekdays, weekdayIndexOf(localDate));
  }

  getGoal(id: EntityId): Promise<DailyGoal | null> {
    return this.deps.repository.findById(id);
  }
}
