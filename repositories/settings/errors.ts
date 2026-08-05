import type { z } from 'zod';

/** Thrown by `SettingsRepository.set()` when the value fails its key's Zod schema - writes never silently persist an invalid value. */
export class InvalidSettingValueError extends Error {
  constructor(
    public readonly key: string,
    public readonly issues: z.core.$ZodIssue[],
  ) {
    super(`Invalid value for setting "${key}": ${issues.map((issue) => issue.message).join('; ')}`);
    this.name = 'InvalidSettingValueError';
  }
}
