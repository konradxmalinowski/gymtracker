import { z } from 'zod';
import type { EntityId } from '@/repositories/contracts/repository';
import { EXERCISE_REST_SECONDS_MAX } from '@/features/exercise-library';
import { PlanValidationError, SupersetMinimumSizeError } from './errors';
import type {
  AddPlanDayExerciseInput,
  AddPlanDayInput,
  CreatePlanInput,
  PlanAggregate,
  PlanDay,
  PlanDayExercise,
  PlanListItem,
  PlanRepository,
  UpdatePlanDayExercisePatch,
} from '../repository/PlanRepository';

/** No existing convention to match (plans are a new P5 concept) - sized the same as `EXERCISE_NAME_MAX_LENGTH` for the same reason: generous for any real plan/day name, short enough to never need truncation in a list row or header. */
export const PLAN_NAME_MAX_LENGTH = 100;
export const PLAN_DAY_NAME_MAX_LENGTH = 100;

/** Sized like `EXERCISE_NOTE_MAX_LENGTH` - a plan description, a day note, and a per-exercise note are all free-text fields of the same rough shape. */
export const PLAN_DESCRIPTION_MAX_LENGTH = 1000;
export const PLAN_DAY_NOTE_MAX_LENGTH = 1000;
export const PLAN_DAY_EXERCISE_NOTE_MAX_LENGTH = 1000;

/** `target_sets` CHECK constraint (`database/schema.sql`): `target_sets IS NULL OR target_sets BETWEEN 1 AND 50`. */
const targetSetsSchema = z.number().int().min(1).max(50);
/** `target_rpe` CHECK constraint: `target_rpe IS NULL OR target_rpe BETWEEN 1 AND 10`. Not integer-only - RPE is commonly logged in half-points (e.g. 7.5). */
const targetRpeSchema = z.number().min(1).max(10);
/**
 * No CHECK constraint on `target_rep_min`/`target_rep_max` individually (only
 * their relationship - see `repRangeIsValid` below), but a target rep count of
 * 0 has no sensible meaning as a *target*, so this rejects it rather than
 * silently accepting a value the schema itself would allow through.
 */
const targetRepSchema = z.number().int().min(1);
/**
 * No CHECK constraint at all on `rest_seconds` (per this phase's task brief -
 * "there's no CHECK constraint for this one specifically but negative rest
 * makes no sense"). Zero is rejected alongside negative values: a rest
 * *override* of "0 seconds" carries no information beyond `null` (no
 * override), so requiring a positive value keeps the two states distinct.
 * Upper bound reuses `EXERCISE_REST_SECONDS_MAX` rather than inventing a
 * second constant for the same real-world quantity a per-exercise rest
 * override already caps at (`features/exercise-library/services/ExerciseService.ts`).
 */
const restSecondsSchema = z.number().int().min(1).max(EXERCISE_REST_SECONDS_MAX);

const planNameSchema = z
  .string()
  .trim()
  .min(1, 'Plan name is required.')
  .max(PLAN_NAME_MAX_LENGTH);
const planDescriptionSchema = z.string().trim().max(PLAN_DESCRIPTION_MAX_LENGTH).nullish();
/** Free-form theme token key (e.g. `'accent'`, `'chart.2'`) - just guarded against an empty string, not a fixed enum, since the token set lives in `theme/tokens.ts` and this layer shouldn't hardcode it. */
const planColorSchema = z.string().trim().min(1).nullish();

const dayNameSchema = z
  .string()
  .trim()
  .min(1, 'Day name is required.')
  .max(PLAN_DAY_NAME_MAX_LENGTH);
const dayNoteSchema = z.string().trim().max(PLAN_DAY_NOTE_MAX_LENGTH).nullish();

/** `plan_day_exercise` CHECK constraint: `target_rep_min IS NULL OR target_rep_max IS NULL OR target_rep_min <= target_rep_max`. */
function repRangeIsValid(input: {
  targetRepMin?: number | null | undefined;
  targetRepMax?: number | null | undefined;
}): boolean {
  if (input.targetRepMin == null || input.targetRepMax == null) {
    return true;
  }
  return input.targetRepMin <= input.targetRepMax;
}

const repRangeRefinement = {
  message: 'targetRepMin must be less than or equal to targetRepMax.',
  path: ['targetRepMax'],
};

const dayExerciseTargetFieldsSchema = z.object({
  targetSets: targetSetsSchema.nullish(),
  targetRepMin: targetRepSchema.nullish(),
  targetRepMax: targetRepSchema.nullish(),
  targetRpe: targetRpeSchema.nullish(),
  restSeconds: restSecondsSchema.nullish(),
  note: z.string().trim().max(PLAN_DAY_EXERCISE_NOTE_MAX_LENGTH).nullish(),
});

const createPlanSchema = z.object({
  name: planNameSchema,
  description: planDescriptionSchema,
  color: planColorSchema,
});

const addDaySchema = z.object({
  name: dayNameSchema,
  note: dayNoteSchema,
});

const addExerciseToDaySchema = dayExerciseTargetFieldsSchema
  .extend({ exerciseId: z.string().trim().min(1, 'exerciseId is required.') })
  .refine(repRangeIsValid, repRangeRefinement);

const updateDayExerciseSchema = dayExerciseTargetFieldsSchema.refine(
  repRangeIsValid,
  repRangeRefinement,
);

function parseWithSchema<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new PlanValidationError(result.error.issues);
  }
  return result.data;
}

/**
 * Validation-only counterpart to `parseWithSchema()` - same
 * `exactOptionalPropertyTypes` mismatch `ExerciseService.checkWithSchema()`
 * documents: an object with optional fields, once round-tripped through
 * Zod's own inferred output type (`T | undefined`), is not assignable back to
 * `CreatePlanInput`/`AddPlanDayExerciseInput`/`UpdatePlanDayExercisePatch`
 * (`T | null`, key omitted rather than present-as-`undefined`). On success the
 * original object is passed straight through to the repository unchanged;
 * only failure needs the parsed Zod issues.
 */
function checkWithSchema(schema: z.ZodTypeAny, input: unknown): void {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new PlanValidationError(result.error.issues);
  }
}

/** `" (copy)"`/`" (copy 2)"`/... - whatever `PlanRepository.duplicatePlan()` or this service's own disambiguation last appended. */
const COPY_SUFFIX_PATTERN = / \(copy(?: \d+)?\)$/;

/**
 * Strips every trailing copy suffix, not just one - duplicating a plan that
 * is itself already a copy (e.g. `"Push Day (copy)"`) should disambiguate
 * against the root name (`"Push Day"`), producing `"Push Day (copy 2)"`
 * rather than compounding suffixes into `"Push Day (copy) (copy)"`.
 */
function rootNameOf(name: string): string {
  let result = name;
  while (COPY_SUFFIX_PATTERN.test(result)) {
    result = result.replace(COPY_SUFFIX_PATTERN, '');
  }
  return result;
}

/**
 * Pure name-disambiguation logic shared by `duplicatePlan()` and
 * `duplicateDay()` - both face the exact same problem (a repository-level
 * `duplicate*` always appends the literal `" (copy)"`, so a second duplicate
 * of the same source collides on an identical name) at different scopes: a
 * plan name only needs to be unique across all plans, a day name only needs
 * to be unique within its own plan. The caller is responsible for gathering
 * the right `existingNames` for its scope (all other plans' names, or all
 * other days' names within the same plan) - this function only knows about
 * strings, never about plans or days.
 *
 * Returns `null` when `"<rootName> (copy)"` is already free (the common
 * case - no rename needed), otherwise the next free `"(copy N)"` name.
 */
function resolveCopyName(rootName: string, existingNames: readonly string[]): string | null {
  const namesInUse = new Set(existingNames);

  const firstCandidate = `${rootName} (copy)`;
  if (!namesInUse.has(firstCandidate)) {
    return null;
  }

  let suffix = 2;
  while (namesInUse.has(`${rootName} (copy ${suffix})`)) {
    suffix += 1;
  }
  return `${rootName} (copy ${suffix})`;
}

export interface PlanServiceDependencies {
  repository: PlanRepository;
}

/**
 * The only door into `PlanRepository` (ARCHITECTURE.md section 3.1, rule 3 -
 * presentation never touches a repository directly). Hooks/screens built on
 * top of this call these methods and nothing else - never
 * `SqlitePlanRepository` directly.
 */
export class PlanService {
  constructor(private readonly deps: PlanServiceDependencies) {}

  listPlans(): Promise<PlanListItem[]> {
    return this.deps.repository.listPlans();
  }

  getPlan(id: EntityId): Promise<PlanAggregate | null> {
    return this.deps.repository.getPlan(id);
  }

  /** @throws {PlanValidationError} when `name` is empty/too long, or a provided `description`/`color` fails its own check. */
  async createPlan(input: CreatePlanInput): Promise<PlanAggregate> {
    checkWithSchema(createPlanSchema, input);
    return this.deps.repository.createPlan(input);
  }

  /** @throws {PlanValidationError} when `name` is empty or too long. */
  async renamePlan(id: EntityId, name: string): Promise<void> {
    const validated = parseWithSchema(planNameSchema, name);
    return this.deps.repository.renamePlan(id, validated);
  }

  /**
   * Duplicates the plan, then disambiguates the copy's name against every
   * other existing plan name so repeated duplicates never collide
   * (`"Push Day (copy)"`, `"Push Day (copy 2)"`, `"Push Day (copy 3)"`, ...) -
   * left to this service by `PlanRepository.duplicatePlan()`'s own doc
   * comment, which always appends the literal `" (copy)"` with no
   * disambiguation. Mechanism: let the repository do the deep copy and name
   * the result `"<original> (copy)"` as it already does, then check whether
   * that exact name collides with any other plan; if it does, rename the new
   * copy (one extra `renamePlan` call, only when needed) to the next free
   * `"(copy N)"` suffix. Chosen over pre-computing the final name before
   * calling the repository because it keeps `duplicatePlan`'s deep-copy
   * transaction untouched and only pays the extra write in the (common)
   * repeated-duplicate case.
   */
  async duplicatePlan(id: EntityId): Promise<PlanAggregate> {
    const created = await this.deps.repository.duplicatePlan(id);
    const rootName = rootNameOf(created.name);
    const siblings = await this.deps.repository.listPlans();
    const namesInUse = siblings.filter((plan) => plan.id !== created.id).map((plan) => plan.name);
    const disambiguated = resolveCopyName(rootName, namesInUse);
    if (disambiguated === null) {
      return created;
    }
    await this.deps.repository.renamePlan(created.id, disambiguated);
    return { ...created, name: disambiguated };
  }

  setActivePlan(id: EntityId): Promise<void> {
    return this.deps.repository.setActivePlan(id);
  }

  reorderPlans(orderedIds: readonly EntityId[]): Promise<void> {
    return this.deps.repository.reorderPlans(orderedIds);
  }

  /** @throws {PlanValidationError} when `input.name` is empty/too long, or `input.note` fails its own check. */
  async addDay(planId: EntityId, input: AddPlanDayInput): Promise<PlanDay> {
    checkWithSchema(addDaySchema, input);
    return this.deps.repository.addDay(planId, input);
  }

  /** @throws {PlanValidationError} when `name` is empty or too long. */
  async renameDay(dayId: EntityId, name: string): Promise<void> {
    const validated = parseWithSchema(dayNameSchema, name);
    return this.deps.repository.renameDay(dayId, validated);
  }

  /**
   * Same disambiguation as {@link duplicatePlan}, scoped to the day's own
   * plan rather than globally - a day name only needs to be unique within
   * its plan (`"Upper A"` in two different plans is not a collision), so
   * this checks `getPlan(planId).days`, not every day across every plan.
   * Reuses the shared `resolveCopyName()` helper rather than re-deriving the
   * suffix-scanning logic.
   */
  async duplicateDay(dayId: EntityId): Promise<PlanDay> {
    const created = await this.deps.repository.duplicateDay(dayId);
    const rootName = rootNameOf(created.name);
    const plan = await this.deps.repository.getPlan(created.planId);
    const siblingDays = plan?.days ?? [];
    const namesInUse = siblingDays.filter((day) => day.id !== created.id).map((day) => day.name);
    const disambiguated = resolveCopyName(rootName, namesInUse);
    if (disambiguated === null) {
      return created;
    }
    await this.deps.repository.renameDay(created.id, disambiguated);
    return { ...created, name: disambiguated };
  }

  /**
   * Confirm-dialog, no-undo (`docs/ARCHITECTURE.md` section 10.2's nav rules
   * table: confirmation dialogs are reserved for delete-*plan*). Calls
   * `purgePlan` - the repository's hard delete - not the soft-deleting
   * `deletePlan`, because a hard delete is what's needed for
   * `workout_session.plan_id`/`plan_day_id` to go `NULL` via the schema's
   * `ON DELETE SET NULL` while `plan_name_snapshot`/`plan_day_name_snapshot`
   * survive. There is deliberately no `restorePlan` exposed here to pair
   * with this method - a hard delete has nothing to undo; the confirmation
   * dialog *is* the safety mechanism for this one operation, not a toast.
   */
  deletePlan(id: EntityId): Promise<void> {
    return this.deps.repository.purgePlan(id);
  }

  /**
   * Delete-plus-undo-toast (`docs/ARCHITECTURE.md` section 10.2's nav rules
   * table: "everything else" below plan level). Soft delete - pairs with
   * {@link restoreDay} as the undo toast's call target.
   */
  deleteDay(dayId: EntityId): Promise<void> {
    return this.deps.repository.deleteDay(dayId);
  }

  /** Undoes {@link deleteDay}. */
  restoreDay(dayId: EntityId): Promise<void> {
    return this.deps.repository.restoreDay(dayId);
  }

  reorderDays(planId: EntityId, orderedDayIds: readonly EntityId[]): Promise<void> {
    return this.deps.repository.reorderDays(planId, orderedDayIds);
  }

  /** @throws {PlanValidationError} when `exerciseId` is missing, a target field is out of range, or `targetRepMin > targetRepMax`. */
  async addExerciseToDay(
    dayId: EntityId,
    input: AddPlanDayExerciseInput,
  ): Promise<PlanDayExercise> {
    checkWithSchema(addExerciseToDaySchema, input);
    return this.deps.repository.addExerciseToDay(dayId, input);
  }

  /** @throws {PlanValidationError} when a provided target field is out of range, or the patch would leave `targetRepMin > targetRepMax`. */
  async updateDayExercise(
    id: EntityId,
    patch: UpdatePlanDayExercisePatch,
  ): Promise<PlanDayExercise> {
    checkWithSchema(updateDayExerciseSchema, patch);
    return this.deps.repository.updateDayExercise(id, patch);
  }

  /**
   * Delete-plus-undo-toast, same nav-rules reasoning as {@link deleteDay}.
   * Soft delete - pairs with {@link restoreDayExercise}.
   */
  removeExerciseFromDay(id: EntityId): Promise<void> {
    return this.deps.repository.removeExerciseFromDay(id);
  }

  /** Undoes {@link removeExerciseFromDay}. */
  restoreDayExercise(id: EntityId): Promise<void> {
    return this.deps.repository.restoreDayExercise(id);
  }

  reorderDayExercises(dayId: EntityId, orderedIds: readonly EntityId[]): Promise<void> {
    return this.deps.repository.reorderDayExercises(dayId, orderedIds);
  }

  /**
   * @throws {SupersetMinimumSizeError} when `group` is a number (forming or
   * updating a superset) and fewer than 2 ids are passed - a superset is
   * meaningless with a single exercise, and the repository deliberately
   * does not enforce this itself (see its own doc comment). The minimum
   * does NOT apply when `group` is `null`: removing a single exercise from
   * an existing superset back to standalone is a distinct, legitimate
   * action from forming a group, and must work with one id.
   * @throws {SupersetSpansMultipleDaysError} propagated as-is from the
   * repository (`features/plans/repository/errors.ts`) when the ids span
   * more than one `plan_day` - that invariant is the repository's own to
   * guard, not re-derived here, mirroring how `ExerciseService.updateCustom()`
   * propagates `ExerciseNotEditableError` unchanged.
   *
   * `async` (rather than validating synchronously and returning the
   * repository's promise directly) so the minimum-size check surfaces as a
   * rejected promise, not a synchronous throw - every other validating
   * method on this service (`createPlan`, `addDay`, `addExerciseToDay`, ...)
   * is `async` for the same reason, mirroring `ExerciseService.createCustom()`'s
   * own documented rationale.
   */
  async setSupersetGroup(
    dayExerciseIds: readonly EntityId[],
    group: number | null,
  ): Promise<void> {
    if (group !== null && dayExerciseIds.length < 2) {
      throw new SupersetMinimumSizeError(dayExerciseIds);
    }
    return this.deps.repository.setSupersetGroup(dayExerciseIds, group);
  }
}
