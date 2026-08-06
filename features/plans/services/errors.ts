import type { z } from 'zod';

/**
 * Thrown by `PlanService` whenever a mutation's input fails Zod validation
 * (empty plan/day name, an out-of-range target field, an invalid rep range,
 * ...) - mirrors `ExerciseValidationError`'s shape
 * (`features/exercise-library/services/errors.ts`) so callers can
 * `instanceof`-check and read structured Zod issues rather than
 * string-matching a message.
 */
export class PlanValidationError extends Error {
  constructor(public readonly issues: z.core.$ZodIssue[]) {
    super(`Invalid plan input: ${issues.map((issue) => issue.message).join('; ')}`);
    this.name = 'PlanValidationError';
  }
}

/**
 * Thrown by `PlanService.setSupersetGroup()` when fewer than two exercise ids
 * are passed. The repository's own `setSupersetGroup` only guards the
 * cross-day invariant (`SupersetSpansMultipleDaysError`,
 * `features/plans/repository/errors.ts`) - grouping is meaningless with a
 * single exercise, and that's a business rule the repository was
 * deliberately left not to enforce (see this phase's task brief), so it lives
 * here instead.
 */
export class SupersetMinimumSizeError extends Error {
  constructor(public readonly dayExerciseIds: readonly string[]) {
    super(
      `A superset requires at least 2 exercises; received ${dayExerciseIds.length}.`,
    );
    this.name = 'SupersetMinimumSizeError';
  }
}
