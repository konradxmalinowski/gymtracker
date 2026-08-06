import type { SqlExecutor } from '@/repositories/contracts/database';

/** ARCHITECTURE.md section 7.3 `user_profile.sex` check constraint. */
export type ProfileSex = 'male' | 'female' | 'unspecified';

/**
 * The `user_profile` singleton row (ARCHITECTURE.md section 7.3). `id` is
 * always the literal `'local'` - there is exactly one profile per install,
 * never a list of profiles - kept as a literal type here rather than `string`
 * so a caller can't accidentally treat this as a normal UUID-keyed entity.
 */
export interface Profile {
  id: 'local';
  nickname: string;
  /** Relative file name inside `avatars/` (ADR-0012), never an absolute URI. `null` when no avatar has been set. */
  avatarFileName: string | null;
  /** `YYYY-MM-DD`, optional. */
  birthDate: string | null;
  sex: ProfileSex | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreateProfileInput {
  nickname: string;
  avatarFileName?: string | null;
  birthDate?: string | null;
  sex?: ProfileSex | null;
}

/** Every field is optional - only the fields present are changed. */
export interface UpdateProfilePatch {
  nickname?: string;
  avatarFileName?: string | null;
  birthDate?: string | null;
  sex?: ProfileSex | null;
}

/**
 * ARCHITECTURE.md section 8.3: "`ProfileRepository` follows the same shape"
 * as the other feature repositories, adapted for a singleton row - no `id`
 * parameter on any method (there is only ever one profile), and `create()`
 * is a one-time operation gated by onboarding rather than something callable
 * repeatedly.
 */
export interface ProfileRepository {
  /** `null` when onboarding has never run - the fresh-install case. */
  get(tx?: SqlExecutor): Promise<Profile | null>;
  /** @throws {ProfileAlreadyExistsError} when a profile row already exists. */
  create(input: CreateProfileInput, tx?: SqlExecutor): Promise<Profile>;
  /** @throws {ProfileNotFoundError} when no profile exists yet. */
  update(patch: UpdateProfilePatch, tx?: SqlExecutor): Promise<Profile>;
}
