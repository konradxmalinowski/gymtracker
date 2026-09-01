import type { z } from 'zod';

/**
 * Thrown by `BodyMetricService` whenever a mutation's input fails Zod
 * validation (unrecognized `metric`, a non-finite/zero/negative `value`, or
 * an over-length `note`) - mirrors `PlanValidationError`'s shape
 * (`features/plans/services/errors.ts`) so callers can `instanceof`-check and
 * read structured Zod issues rather than string-matching a message.
 */
export class BodyMetricValidationError extends Error {
  constructor(public readonly issues: z.core.$ZodIssue[]) {
    super(`Invalid body metric input: ${issues.map((issue) => issue.message).join('; ')}`);
    this.name = 'BodyMetricValidationError';
  }
}

/**
 * Thrown by `ProgressPhotoService` whenever a mutation's input fails Zod
 * validation (unrecognized `pose` or an over-length `note`). Same shape as
 * {@link BodyMetricValidationError}.
 */
export class ProgressPhotoValidationError extends Error {
  constructor(public readonly issues: z.core.$ZodIssue[]) {
    super(`Invalid progress photo input: ${issues.map((issue) => issue.message).join('; ')}`);
    this.name = 'ProgressPhotoValidationError';
  }
}
