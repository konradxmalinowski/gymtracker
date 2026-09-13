import type { z } from 'zod';

/**
 * Thrown by `DailyGoalService` whenever a mutation's input fails Zod
 * validation (unrecognized `goalType`, a missing/non-positive `targetValue`
 * on a `counter`/`numeric` goal, an out-of-range `activeWeekdays`, or an
 * over-length `name`/`icon`/`unit`) - mirrors `PlanValidationError`/
 * `BodyMetricValidationError`'s shape so callers can `instanceof`-check and
 * read structured Zod issues rather than string-matching a message.
 */
export class DailyGoalValidationError extends Error {
  constructor(public readonly issues: z.core.$ZodIssue[]) {
    super(`Invalid daily goal input: ${issues.map((issue) => issue.message).join('; ')}`);
    this.name = 'DailyGoalValidationError';
  }
}

/**
 * Thrown by `DailyReminderService` whenever a mutation's input fails Zod
 * validation (unrecognized `reminderType`, a `timeOfDay`/`intervalMinutes`
 * pair that doesn't match `reminderType`, an out-of-range `activeWeekdays`,
 * or an over-length `name`/`icon`). Same shape as {@link DailyGoalValidationError}.
 */
export class DailyReminderValidationError extends Error {
  constructor(public readonly issues: z.core.$ZodIssue[]) {
    super(`Invalid daily reminder input: ${issues.map((issue) => issue.message).join('; ')}`);
    this.name = 'DailyReminderValidationError';
  }
}
