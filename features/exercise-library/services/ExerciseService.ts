import { z } from 'zod';
import type { EntityId } from '@/repositories/contracts/repository';
import type { Logger } from '@/services/logging';
import { ExerciseDeleteBlockedError, ExerciseValidationError } from './errors';
import type {
  CreateCustomExerciseInput,
  Exercise,
  ExerciseListItem,
  ExerciseMuscleRef,
  ExerciseQuery,
  ExerciseRepository,
  PlanReference,
  UpdateCustomExercisePatch,
} from '../repository/ExerciseRepository';

/**
 * Generous enough for any real exercise name (English or Polish, including the
 * long compound names free-exercise-db uses, e.g. "Wyciskanie sztangi leżąc na
 * ławce skośnej dodatniej"), short enough that a name never has to be truncated
 * wherever it's rendered (list rows, the detail header, search results). Mirrors
 * `NICKNAME_MAX_LENGTH`'s "this phase's own call, documented here" precedent
 * (`features/profile/services/ProfileService.ts`) - no existing convention
 * elsewhere in the codebase to match against.
 */
export const EXERCISE_NAME_MAX_LENGTH = 100;

/** Same reasoning as `EXERCISE_NAME_MAX_LENGTH`, sized for a personal note rather than a name. */
export const EXERCISE_NOTE_MAX_LENGTH = 1000;

/**
 * Upper bound for a per-exercise rest override, in seconds. Matches
 * `repositories/settings/settingsSchema.ts`'s existing `timer.defaultRestSeconds`
 * cap (30 minutes) rather than inventing a new number - the two settings describe
 * the same real-world quantity (how long a rest timer runs).
 */
export const EXERCISE_REST_SECONDS_MAX = 1800;

const muscleRoleSchema = z.enum(['primary', 'secondary']);
const forceSchema = z.enum(['push', 'pull', 'static']);
const mechanicSchema = z.enum(['compound', 'isolation']);
const levelSchema = z.enum(['beginner', 'intermediate', 'expert']);
const trackingTypeSchema = z.enum([
  'weight_reps',
  'reps_only',
  'duration',
  'distance_duration',
  'weighted_duration',
]);

const muscleRefSchema: z.ZodType<ExerciseMuscleRef> = z.object({
  slug: z.string().trim().min(1),
  role: muscleRoleSchema,
});

/** Confirmed with the product owner: primary + optional secondary muscles, matching the catalog's own model - so the rule is "at least one primary", not "at least one muscle of any role". */
function hasAtLeastOnePrimaryMuscle(muscles: readonly ExerciseMuscleRef[]): boolean {
  return muscles.some((muscle) => muscle.role === 'primary');
}

const nameSchema = z.string().trim().min(1).max(EXERCISE_NAME_MAX_LENGTH);
const optionalNameSchema = z.string().trim().max(EXERCISE_NAME_MAX_LENGTH).nullish();
const labelSchema = z.string().trim().min(1).max(EXERCISE_NAME_MAX_LENGTH).nullish();

/** FR-07 ("name, muscle group, equipment, notes"): a custom exercise always needs equipment specified, even though the repository-level type allows `null` for other callers (e.g. the seeder). */
const equipmentSlugSchema = z.string().trim().min(1, 'Equipment is required.');

const musclesSchema = z
  .array(muscleRefSchema)
  .min(1, 'At least one muscle is required.')
  .refine(hasAtLeastOnePrimaryMuscle, { message: 'At least one primary muscle is required.' });

const createCustomExerciseSchema = z.object({
  nameEn: nameSchema,
  namePl: optionalNameSchema,
  aliases: z.array(nameSchema).optional(),
  category: labelSchema,
  force: forceSchema.nullish(),
  mechanic: mechanicSchema.nullish(),
  level: levelSchema.nullish(),
  equipmentSlug: equipmentSlugSchema,
  bodyPart: labelSchema,
  trackingType: trackingTypeSchema.optional(),
  instructions: z.array(z.string()).optional(),
  images: z.array(z.string()).optional(),
  muscles: musclesSchema,
});

/**
 * `Partial<CreateCustomExerciseInput>`'s validation counterpart: every field is
 * optional (only fields present in the patch are changed, per
 * `UpdateCustomExercisePatch`'s own doc comment), but a field that *is* present
 * still has to satisfy the same rule it would on create - `equipmentSlug` can't be
 * patched to empty, `muscles` (when provided) still needs a primary, `nameEn`
 * (when provided) can't be blanked out.
 */
const updateCustomExerciseSchema = createCustomExerciseSchema.partial().extend({
  muscles: musclesSchema.optional(),
});

const noteSchema = z.string().max(EXERCISE_NOTE_MAX_LENGTH).nullable();
const restSecondsSchema = z.number().int().min(0).max(EXERCISE_REST_SECONDS_MAX).nullable();

function parseWithSchema<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ExerciseValidationError(result.error.issues);
  }
  return result.data;
}

/**
 * Validation-only counterpart to `parseWithSchema()`, used for `createCustom()`/
 * `updateCustom()`: with `exactOptionalPropertyTypes` on, Zod's own inferred output
 * type for an object with optional fields (`T | undefined`) is not assignable back
 * to `CreateCustomExerciseInput`/`UpdateCustomExercisePatch` (`T | null`, key
 * omitted rather than present-as-`undefined`). Rather than fight that mismatch with
 * a transform, this checks the input and - on success - the original object is
 * passed straight through to the repository unchanged (it already satisfies the
 * target type at compile time); only failure needs the parsed Zod issues. The one
 * behavioral trade-off: whitespace is trimmed for the *validation* check (so
 * `"  "` still fails a `min(1)` name rule) but not stripped from the stored value -
 * the repository persists exactly what the caller passed.
 */
function checkWithSchema(schema: z.ZodTypeAny, input: unknown): void {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ExerciseValidationError(result.error.issues);
  }
}

export interface ExerciseServiceDependencies {
  repository: ExerciseRepository;
  /** Optional: only used to record a non-fatal event (e.g. a blocked delete) for diagnostics. A fake in tests may omit it entirely. */
  logging?: Logger;
}

/**
 * The only door into `ExerciseRepository` (ARCHITECTURE.md section 3.1, rule 3 -
 * presentation never touches a repository directly). Hooks/screens built on top of
 * this in the next phase call these methods and nothing else - never
 * `SqliteExerciseRepository` directly.
 */
export class ExerciseService {
  constructor(private readonly deps: ExerciseServiceDependencies) {}

  search(query: ExerciseQuery): Promise<ExerciseListItem[]> {
    return this.deps.repository.search(query);
  }

  getById(id: EntityId): Promise<Exercise | null> {
    return this.deps.repository.findById(id);
  }

  getByCatalogSlug(slug: string): Promise<Exercise | null> {
    return this.deps.repository.findByCatalogSlug(slug);
  }

  /**
   * @throws {ExerciseValidationError} when `input` fails validation (empty name, no primary muscle, missing equipment, etc).
   *
   * `async` (rather than validating synchronously and returning the repository's
   * promise directly) so a validation failure surfaces as a rejected promise, not
   * a synchronous throw - callers `await`/`.catch()` every other method here the
   * same way, and a caller that did `promise.catch(...)` on this one without
   * `await` would otherwise see an uncaught synchronous exception instead.
   */
  async createCustom(input: CreateCustomExerciseInput): Promise<Exercise> {
    checkWithSchema(createCustomExerciseSchema, input);
    return this.deps.repository.createCustom(input);
  }

  /**
   * @throws {ExerciseValidationError} when a provided field fails validation.
   * @throws {ExerciseNotEditableError} when `id` names a catalog-source exercise - propagated as-is from the repository (`features/exercise-library/repository/errors.ts`), the same hard schema-level invariant `SqliteExerciseRepository` already enforces, not re-derived here.
   */
  async updateCustom(id: EntityId, patch: UpdateCustomExercisePatch): Promise<Exercise> {
    checkWithSchema(updateCustomExerciseSchema, patch);
    return this.deps.repository.updateCustom(id, patch);
  }

  /**
   * ROADMAP.md P4's literal acceptance criterion: "deleting an exercise used by a
   * plan explains which plan blocks it". Checks `listReferencingPlans` first and
   * throws `ExerciseDeleteBlockedError` (carrying the blocking plans) without ever
   * calling `deleteCustom` when the exercise is still referenced. When it isn't,
   * `deleteCustom` runs and may itself throw `ExerciseNotEditableError` for a
   * catalog-source id - propagated as-is, same as `updateCustom`.
   */
  async deleteWithGuard(id: EntityId): Promise<void> {
    const blockingPlans = await this.deps.repository.listReferencingPlans(id);
    if (blockingPlans.length > 0) {
      this.deps.logging?.info('exercise.delete.blocked', {
        exerciseId: id,
        planCount: blockingPlans.length,
      });
      throw new ExerciseDeleteBlockedError(id, blockingPlans);
    }
    await this.deps.repository.deleteCustom(id);
  }

  setFavorite(id: EntityId, value: boolean): Promise<void> {
    return this.deps.repository.setFavorite(id, value);
  }

  /** @throws {ExerciseValidationError} when `note` exceeds `EXERCISE_NOTE_MAX_LENGTH`. */
  async setNote(id: EntityId, note: string | null): Promise<void> {
    const validated = parseWithSchema(noteSchema, note);
    return this.deps.repository.setNote(id, validated);
  }

  /** @throws {ExerciseValidationError} when `seconds` is negative, non-integer, or exceeds `EXERCISE_REST_SECONDS_MAX`. */
  async setDefaultRest(id: EntityId, seconds: number | null): Promise<void> {
    const validated = parseWithSchema(restSecondsSchema, seconds);
    return this.deps.repository.setDefaultRest(id, validated);
  }

  listReferencingPlans(id: EntityId): Promise<PlanReference[]> {
    return this.deps.repository.listReferencingPlans(id);
  }
}
