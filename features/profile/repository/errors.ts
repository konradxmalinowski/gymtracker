/**
 * `user_profile` is a singleton row (`id` is always `'local'` - ARCHITECTURE.md
 * section 7.3), so its failure modes are narrower than a normal UUID-keyed
 * entity: "already exists" (a second `create()`) and "not found" (an `update()`
 * before onboarding has ever run). Kept as dedicated error classes, the same
 * pattern `repositories/settings/errors.ts` uses for `InvalidSettingValueError`,
 * so callers can `instanceof`-check rather than string-match a message.
 */
export class ProfileAlreadyExistsError extends Error {
  constructor() {
    super('A profile already exists. Only one local profile row may exist at a time.');
    this.name = 'ProfileAlreadyExistsError';
  }
}

export class ProfileNotFoundError extends Error {
  constructor() {
    super('No profile exists yet. Complete onboarding before updating the profile.');
    this.name = 'ProfileNotFoundError';
  }
}
