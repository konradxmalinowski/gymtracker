import type { z } from 'zod';
import type { PlanReference } from '../repository/ExerciseRepository';

/**
 * Thrown by `ExerciseService.createCustom()`/`updateCustom()` when the input fails
 * Zod validation - mirrors `InvalidNicknameError`'s shape
 * (`features/profile/services/errors.ts`) so callers can `instanceof`-check and
 * read structured Zod issues rather than string-matching a message.
 */
export class ExerciseValidationError extends Error {
  constructor(public readonly issues: z.core.$ZodIssue[]) {
    super(`Invalid exercise input: ${issues.map((issue) => issue.message).join('; ')}`);
    this.name = 'ExerciseValidationError';
  }
}

/**
 * Thrown by `ExerciseService.deleteWithGuard()` (ROADMAP.md P4's literal acceptance
 * criterion: "deleting an exercise used by a plan explains which plan blocks it").
 * Carries the full `PlanReference[]` (id + name, deduped by plan) rather than just a
 * message string, so the UI can render "used in Push Day, Full Body" or link out to
 * each plan, not just show opaque text.
 */
export class ExerciseDeleteBlockedError extends Error {
  constructor(
    public readonly exerciseId: string,
    public readonly blockingPlans: readonly PlanReference[],
  ) {
    super(
      `Cannot delete exercise "${exerciseId}": still used in ${blockingPlans
        .map((plan) => plan.planName)
        .join(', ')}.`,
    );
    this.name = 'ExerciseDeleteBlockedError';
  }
}
