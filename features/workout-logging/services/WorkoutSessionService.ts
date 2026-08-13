import { z } from 'zod';
import type { EntityId } from '@/repositories/contracts/repository';
import {
  REST_SECONDS_MAX,
  REST_SECONDS_MIN,
  type SettingsRepository,
} from '@/repositories/settings';
import type { Clock } from '@/services/clock';
import { SET_TYPES } from '../domain/setSemantics';
import { isSessionStale } from '../domain/sessionStaleness';
import type {
  ActiveSessionAggregate,
  ActiveStatePatch,
  CompleteSetValues,
  CompletedSetResult,
  SessionExercise,
  SessionSummary,
  SetSeed,
  UpdateSetPatch,
  WorkoutSessionRepository,
  WorkoutSet,
} from '../repository/WorkoutSessionRepository';
import { SessionAlreadyInProgressError } from '../repository/errors';
import { SessionSupersetMinimumSizeError, WorkoutValidationError } from './errors';

/** Sized like `PLAN_NAME_MAX_LENGTH` - a session title is the same kind of short header string. */
export const SESSION_TITLE_MAX_LENGTH = 100;
/** Sized like `PLAN_DAY_EXERCISE_NOTE_MAX_LENGTH` - a set note, an exercise note and a workout note are all free text of the same rough shape. */
export const WORKOUT_NOTE_MAX_LENGTH = 1000;

/** `workout_set.reps` CHECK constraint: `reps IS NULL OR reps BETWEEN 0 AND 1000`. */
const repsSchema = z.number().int().min(0).max(1000);
/** `workout_set.weight_kg` CHECK constraint: `weight_kg IS NULL OR weight_kg >= 0`. Assisted sets store the assistance as a positive number (ADR-0006), so there is no negative-weight case to allow. */
const weightSchema = z.number().min(0).finite();
/** `workout_set.rpe` CHECK constraint: `rpe IS NULL OR rpe BETWEEN 1 AND 10`. Not integer-only - RPE is commonly logged in half points. */
const rpeSchema = z.number().min(1).max(10);
/** No CHECK constraint on either column, but a negative duration or distance has no meaning. */
const durationSchema = z.number().int().min(0);
const distanceSchema = z.number().min(0).finite();
const setTypeSchema = z.enum(SET_TYPES);
const noteSchema = z.string().trim().max(WORKOUT_NOTE_MAX_LENGTH);
const timestampSchema = z.number().int().min(0);

const setValuesShape = {
  weightKg: weightSchema.nullish(),
  reps: repsSchema.nullish(),
  durationSeconds: durationSchema.nullish(),
  distanceM: distanceSchema.nullish(),
  rpe: rpeSchema.nullish(),
  note: noteSchema.nullish(),
};

const setSeedSchema = z.object({ ...setValuesShape, setType: setTypeSchema.optional() });
const updateSetPatchSchema = setSeedSchema;
const completeSetValuesSchema = z.object({
  ...setValuesShape,
  completedAt: timestampSchema.optional(),
});
/** Exercise and workout notes are cleared by passing `null`, so unlike a set's note they are nullable rather than optional. */
const nullableNoteSchema = noteSchema.nullable();
const titleSchema = z.string().trim().min(1).max(SESSION_TITLE_MAX_LENGTH);
const supersetGroupSchema = z.number().int().min(0).nullable();
/** `timer.defaultRestSeconds`'s own settings schema bounds (`repositories/settings/settingsSchema.ts`, `REST_SECONDS_MIN`/`MAX`) - a manually adjusted rest override is the same kind of value. */
const restSecondsOverrideSchema = z.number().int().min(REST_SECONDS_MIN).max(REST_SECONDS_MAX);

/**
 * Validation-only counterpart to a `schema.parse()` - the same
 * `exactOptionalPropertyTypes` mismatch `PlanService.checkWithSchema()`
 * documents: an object with optional fields, once round-tripped through Zod's
 * inferred output type (`T | undefined`), is no longer assignable back to the
 * repository's `SetSeed`/`UpdateSetPatch` (`T | null`, key omitted rather than
 * present-as-`undefined`). On success the caller's original object goes to the
 * repository unchanged.
 */
function check(schema: z.ZodTypeAny, input: unknown): void {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new WorkoutValidationError(result.error.issues);
  }
}

/** An in-progress session plus the staleness verdict ADR-0005 mechanism 7 needs, so the resume prompt can branch without re-reading a setting itself. */
export interface ActiveSessionSnapshot {
  session: ActiveSessionAggregate;
  /**
   * `true` once `workout.staleAfterHours` have elapsed since `startedAt`. The
   * resume prompt becomes finish-or-discard rather than a silent resume, so a
   * workout forgotten overnight never reports a 14-hour duration.
   */
  isStale: boolean;
  /** The threshold that produced `isStale`, so a prompt can say "started 9 hours ago" against a known limit. */
  staleAfterHours: number;
}

/**
 * What starting a workout can result in. A session already being in progress is
 * an expected outcome with a user-facing choice attached ("resume or discard"),
 * not an exception - the repository's `SessionAlreadyInProgressError` is caught
 * here and turned into `blocked`, carrying the existing session so the caller
 * has everything it needs to render that prompt without a second query.
 */
export type StartSessionResult =
  | { outcome: 'started'; session: ActiveSessionAggregate }
  | { outcome: 'blocked'; existing: ActiveSessionSnapshot };

export interface WorkoutSessionServiceDependencies {
  repository: WorkoutSessionRepository;
  settings: SettingsRepository;
  clock: Clock;
}

/**
 * The only door into `WorkoutSessionRepository` (ARCHITECTURE.md section 3.1
 * rule 3). Hooks and screens call these methods and nothing else.
 *
 * Every write here is a single awaited repository call, deliberately: ADR-0008's
 * active-workout exception has the Zustand store update synchronously and the
 * repository write dispatched afterwards, with the store reconciled from the
 * database if the write fails. That pattern needs a service whose methods
 * either resolve (the write committed) or reject (reconcile and toast) - which
 * is what a thin per-mutation transaction gives it. Nothing here batches,
 * debounces or retries.
 */
export class WorkoutSessionService {
  constructor(private readonly deps: WorkoutSessionServiceDependencies) {}

  /** FR-19 recovery entry point, with the staleness verdict already applied. `null` when no workout is in progress. */
  async findInProgress(): Promise<ActiveSessionSnapshot | null> {
    const session = await this.deps.repository.findInProgress();
    if (!session) {
      return null;
    }
    return this.toSnapshot(session);
  }

  /** @throws {WorkoutValidationError} when `startedAt` is not a valid timestamp. */
  async startFromPlanDay(planDayId: EntityId, startedAt?: number): Promise<StartSessionResult> {
    const at = startedAt ?? this.deps.clock.now();
    check(timestampSchema, at);
    const globalDefaultRestSeconds = await this.deps.settings.get('timer.defaultRestSeconds');
    return this.start(() =>
      this.deps.repository.startFromPlanDay(planDayId, at, globalDefaultRestSeconds),
    );
  }

  /** "Quick Start". @throws {WorkoutValidationError} when `title` is empty or too long. */
  async startEmpty(startedAt?: number, title?: string): Promise<StartSessionResult> {
    const at = startedAt ?? this.deps.clock.now();
    check(timestampSchema, at);
    if (title !== undefined) {
      check(titleSchema, title);
    }
    return this.start(() =>
      title === undefined
        ? this.deps.repository.startEmpty(at)
        : this.deps.repository.startEmpty(at, title.trim()),
    );
  }

  async addExercise(
    sessionId: EntityId,
    exerciseId: EntityId,
    atIndex?: number,
  ): Promise<SessionExercise> {
    const globalDefaultRestSeconds = await this.deps.settings.get('timer.defaultRestSeconds');
    return atIndex === undefined
      ? this.deps.repository.addExercise(sessionId, exerciseId, globalDefaultRestSeconds)
      : this.deps.repository.addExercise(sessionId, exerciseId, globalDefaultRestSeconds, atIndex);
  }

  /** Soft delete - pairs with {@link restoreExercise} as the undo toast's call target. */
  removeExercise(sessionExerciseId: EntityId): Promise<void> {
    return this.deps.repository.removeExercise(sessionExerciseId);
  }

  /** Undoes {@link removeExercise}. */
  restoreExercise(sessionExerciseId: EntityId): Promise<void> {
    return this.deps.repository.restoreExercise(sessionExerciseId);
  }

  /**
   * FR-16 exercise-level note. `null` clears it.
   *
   * @throws {WorkoutValidationError} when the note exceeds {@link WORKOUT_NOTE_MAX_LENGTH}.
   * @throws {RepositoryNotFoundError} when the `session_exercise` does not exist or is soft-deleted.
   */
  async setExerciseNote(sessionExerciseId: EntityId, note: string | null): Promise<void> {
    check(nullableNoteSchema, note);
    return this.deps.repository.setExerciseNote(sessionExerciseId, note);
  }

  /**
   * P7 tap-to-adjust write path (Step 0 decision 2 in
   * `plans/2026-08-08-p7-rest-timer.md`). @throws {WorkoutValidationError}
   * @throws {RepositoryNotFoundError} when the `session_exercise` does not exist or is soft-deleted.
   */
  async setExerciseRestOverride(sessionExerciseId: EntityId, restSeconds: number): Promise<void> {
    check(restSecondsOverrideSchema, restSeconds);
    return this.deps.repository.setExerciseRestOverride(sessionExerciseId, restSeconds);
  }

  reorderExercises(sessionId: EntityId, orderedIds: readonly EntityId[]): Promise<void> {
    return this.deps.repository.reorderExercises(sessionId, orderedIds);
  }

  /**
   * @throws {SessionSupersetMinimumSizeError} when `group` is a number and fewer
   * than 2 ids are given.
   * @throws {SupersetSpansMultipleSessionsError} propagated unchanged from the
   * repository when the ids span more than one session - that invariant is the
   * repository's to guard, not re-derived here.
   */
  async setSupersetGroup(
    sessionExerciseIds: readonly EntityId[],
    group: number | null,
  ): Promise<void> {
    check(supersetGroupSchema, group);
    if (group !== null && sessionExerciseIds.length < 2) {
      throw new SessionSupersetMinimumSizeError(sessionExerciseIds);
    }
    return this.deps.repository.setSupersetGroup(sessionExerciseIds, group);
  }

  /** Appends a set pre-filled per FR-11 (see the repository's `appendSet`). @throws {WorkoutValidationError} */
  async appendSet(sessionExerciseId: EntityId, seed: SetSeed = {}): Promise<WorkoutSet> {
    check(setSeedSchema, seed);
    return this.deps.repository.appendSet(sessionExerciseId, seed);
  }

  /** @throws {WorkoutValidationError} @throws {DropSegmentSetTypeError} */
  async updateSet(setId: EntityId, patch: UpdateSetPatch): Promise<WorkoutSet> {
    check(updateSetPatchSchema, patch);
    return this.deps.repository.updateSet(setId, patch);
  }

  /**
   * The hot path (ARCHITECTURE.md section 5.1). `newPRs` on the result is always
   * empty until P8 adds record evaluation inside the same transaction.
   *
   * @throws {WorkoutValidationError}
   */
  async completeSet(setId: EntityId, values: CompleteSetValues = {}): Promise<CompletedSetResult> {
    check(completeSetValuesSchema, values);
    return this.deps.repository.completeSet(setId, values);
  }

  uncompleteSet(setId: EntityId): Promise<WorkoutSet> {
    return this.deps.repository.uncompleteSet(setId);
  }

  /** @throws {WorkoutValidationError} @throws {DropSetParentInvalidError} when the parent is itself a drop segment. */
  async addDropSet(parentSetId: EntityId, seed: SetSeed = {}): Promise<WorkoutSet> {
    check(setSeedSchema, seed);
    return this.deps.repository.addDropSet(parentSetId, seed);
  }

  /** Soft delete - the swipe-to-delete undo toast restores the same id via {@link restoreSet}. */
  deleteSet(setId: EntityId): Promise<void> {
    return this.deps.repository.deleteSet(setId);
  }

  /** Undoes {@link deleteSet}. */
  restoreSet(setId: EntityId): Promise<void> {
    return this.deps.repository.restoreSet(setId);
  }

  /**
   * FR-16 workout-level note. `null` clears it. Works on a finished session too,
   * by design - see the repository implementation's comment.
   *
   * @throws {WorkoutValidationError} when the note exceeds {@link WORKOUT_NOTE_MAX_LENGTH}.
   * @throws {RepositoryNotFoundError} when the session does not exist or is soft-deleted.
   */
  async setSessionNotes(sessionId: EntityId, notes: string | null): Promise<void> {
    check(nullableNoteSchema, notes);
    return this.deps.repository.setSessionNotes(sessionId, notes);
  }

  saveActiveState(patch: ActiveStatePatch): Promise<void> {
    return this.deps.repository.saveActiveState(patch);
  }

  /** @throws {SessionNotInProgressError} when the session is already completed or discarded. */
  finish(sessionId: EntityId, finishedAt?: number): Promise<SessionSummary> {
    return this.deps.repository.finish(sessionId, finishedAt ?? this.deps.clock.now());
  }

  /**
   * Leaves the row with `status = 'discarded'` rather than deleting it
   * (ADR-0005). `workout.confirmDiscard` gates the confirmation dialog in the
   * UI, not this call - a service method that sometimes silently does nothing
   * depending on a setting would be a worse contract than one that always
   * discards what it was asked to.
   *
   * @throws {SessionNotInProgressError} when the session is not in progress.
   */
  discard(sessionId: EntityId): Promise<void> {
    return this.deps.repository.discard(sessionId);
  }

  /** Reads `workout.confirmDiscard` so the caller can decide whether to show the confirmation dialog before calling {@link discard}. */
  shouldConfirmDiscard(): Promise<boolean> {
    return this.deps.settings.get('workout.confirmDiscard');
  }

  private async start(run: () => Promise<ActiveSessionAggregate>): Promise<StartSessionResult> {
    try {
      return { outcome: 'started', session: await run() };
    } catch (error) {
      if (!(error instanceof SessionAlreadyInProgressError)) {
        throw error;
      }
      const existing = await this.deps.repository.findInProgress();
      if (!existing) {
        // The blocking row is soft-deleted (findInProgress filters those out,
        // the partial unique index does not), so there is nothing to offer a
        // resume/discard choice over. Re-raise rather than inventing an empty
        // snapshot.
        throw error;
      }
      return { outcome: 'blocked', existing: await this.toSnapshot(existing) };
    }
  }

  private async toSnapshot(session: ActiveSessionAggregate): Promise<ActiveSessionSnapshot> {
    const staleAfterHours = await this.deps.settings.get('workout.staleAfterHours');
    return {
      session,
      staleAfterHours,
      isStale: isSessionStale({
        startedAt: session.startedAt,
        now: this.deps.clock.now(),
        staleAfterHours,
      }),
    };
  }
}
