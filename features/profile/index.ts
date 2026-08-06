/**
 * Public barrel for the "profile" feature.
 *
 * This is the ONLY surface other features may import from (ARCHITECTURE.md
 * section 3.1, rule 4 - enforced by the import/no-restricted-paths zones in
 * eslint.config.js). Reaching into "features/profile/<subfolder>/..." from any
 * other feature is a lint error; import from "@/features/profile" instead.
 *
 * Only `ProfileService` (and the types it speaks) is exported - never
 * `ProfileRepository`/`SqliteProfileRepository`. Presentation (hooks, screens
 * in the next phase) must go through the service, per ARCHITECTURE.md section
 * 3.1 rule 3; re-exporting the repository here would make that mistake one
 * import away.
 */

export {
  ProfileService,
  NICKNAME_MAX_LENGTH,
  AVATAR_DIRECTORY,
  type CompleteOnboardingInput,
  type ProfileServiceDependencies,
} from './services/ProfileService';
export { InvalidNicknameError } from './services/errors';
export type { Profile, ProfileSex } from './repository/ProfileRepository';
export { ProfileAlreadyExistsError, ProfileNotFoundError } from './repository/errors';
