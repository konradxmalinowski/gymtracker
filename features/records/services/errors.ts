import type { z } from 'zod';

/**
 * Thrown by `PersonalRecordService` whenever a mutation's input fails Zod
 * validation - mirrors `PlanValidationError`/`WorkoutValidationError`'s shape
 * so callers can `instanceof`-check and read structured Zod issues rather
 * than string-matching a message.
 */
export class RecordValidationError extends Error {
  constructor(public readonly issues: z.core.$ZodIssue[]) {
    super(`Invalid records input: ${issues.map((issue) => issue.message).join('; ')}`);
    this.name = 'RecordValidationError';
  }
}
