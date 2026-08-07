import type { z } from 'zod';

/**
 * Thrown by `WorkoutSessionService` whenever a mutation's input fails Zod
 * validation (a negative weight, reps outside the schema's own 0-1000 CHECK, an
 * RPE outside 1-10, an unknown set type, ...). Mirrors `PlanValidationError`'s
 * shape so callers can `instanceof`-check and read structured issues rather than
 * string-matching a message.
 */
export class WorkoutValidationError extends Error {
  constructor(public readonly issues: z.core.$ZodIssue[]) {
    super(`Invalid workout input: ${issues.map((issue) => issue.message).join('; ')}`);
    this.name = 'WorkoutValidationError';
  }
}

/**
 * Thrown by `WorkoutSessionService.setSupersetGroup()` when fewer than two
 * exercise ids are passed while forming a group. Exactly the split
 * `PlanService`/`PlanRepository` already use: the repository guards the
 * invariant it cannot allow to be violated (all ids in one session), the
 * service owns the business rule that a superset of one is meaningless. As
 * there, the minimum does not apply when `group` is `null` - clearing a single
 * exercise back to standalone is a legitimate one-id call.
 */
export class SessionSupersetMinimumSizeError extends Error {
  constructor(public readonly sessionExerciseIds: readonly string[]) {
    super(`A superset requires at least 2 exercises; received ${sessionExerciseIds.length}.`);
    this.name = 'SessionSupersetMinimumSizeError';
  }
}
