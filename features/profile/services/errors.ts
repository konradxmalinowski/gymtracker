import type { z } from 'zod';

/** Thrown by `ProfileService.completeOnboarding()`/`updateNickname()` when the nickname fails validation - mirrors `InvalidSettingValueError`'s shape so callers can `instanceof`-check and read structured Zod issues. */
export class InvalidNicknameError extends Error {
  constructor(
    public readonly maxLength: number,
    public readonly issues: z.core.$ZodIssue[],
  ) {
    super(`Invalid nickname: ${issues.map((issue) => issue.message).join('; ')}`);
    this.name = 'InvalidNicknameError';
  }
}
