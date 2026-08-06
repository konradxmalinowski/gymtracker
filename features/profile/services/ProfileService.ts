import { z } from 'zod';
import type { FileStorage } from '@/services/files';
import type { IdGenerator } from '@/services/id';
import type { Logger } from '@/services/logging';
import { InvalidNicknameError } from './errors';
import type { Profile, ProfileRepository } from '../repository/ProfileRepository';

/**
 * Generous enough for any real display name, short enough that a nickname
 * never has to be truncated wherever it's rendered (list rows, the avatar
 * header, settings). No existing convention elsewhere in the app to match
 * against - this is this phase's own call, documented here rather than left
 * implicit in a Zod schema someone has to go read to discover it.
 */
export const NICKNAME_MAX_LENGTH = 40;

/** Relative directory `Profile.avatarFileName` lives inside, under `FileStorage`'s `'document'` root (ADR-0012). Exported so a caller composing an absolute URI via `files.getUri()` knows the bucket - `avatar_file_name` itself stores only the bare file name, never this prefix. */
export const AVATAR_DIRECTORY = 'avatars';

const nicknameSchema = z.string().trim().min(1).max(NICKNAME_MAX_LENGTH);

function parseNickname(nickname: string): string {
  const result = nicknameSchema.safeParse(nickname);
  if (!result.success) {
    throw new InvalidNicknameError(NICKNAME_MAX_LENGTH, result.error.issues);
  }
  return result.data;
}

export interface CompleteOnboardingInput {
  nickname: string;
  /** A picker/camera result URI, outside app storage - `FileStorage.copyFrom()`'s source. Omitted or skipped entirely means "no avatar", a first-class path, not an error state. */
  avatarUri?: string;
}

export interface ProfileServiceDependencies {
  repository: ProfileRepository;
  files: FileStorage;
  idGenerator: IdGenerator;
  /** Optional: only used to record a non-fatal avatar-write failure during onboarding. A fake in tests may omit it entirely. */
  logging?: Logger;
}

/**
 * The only door into `ProfileRepository` (ARCHITECTURE.md section 3.1, rule
 * 3 - presentation never touches a repository directly). Hooks built on top
 * of this in the next phase call these four methods and nothing else.
 */
export class ProfileService {
  constructor(private readonly deps: ProfileServiceDependencies) {}

  /** `null` when onboarding has never run. */
  async getProfile(): Promise<Profile | null> {
    return this.deps.repository.get();
  }

  /**
   * Onboarding is not blocked by an avatar failure: if `avatarUri` is given
   * but the copy fails (disk full, permission revoked mid-flow), the
   * nickname-only profile is still created - the failure is recorded via
   * `logging.warn` and swallowed, never thrown from here.
   */
  async completeOnboarding(input: CompleteOnboardingInput): Promise<Profile> {
    const nickname = parseNickname(input.nickname);
    const avatarFileName = input.avatarUri ? await this.tryWriteAvatar(input.avatarUri) : null;

    return this.deps.repository.create({ nickname, avatarFileName });
  }

  async updateNickname(nickname: string): Promise<Profile> {
    return this.deps.repository.update({ nickname: parseNickname(nickname) });
  }

  /**
   * Unlike the onboarding path, a failure here throws rather than swallowing
   * - this is an explicit user action ("change my avatar") on an existing
   * profile, not a best-effort step inside a larger flow, so the caller needs
   * to know it didn't happen.
   */
  async updateAvatar(avatarUri: string): Promise<Profile> {
    const avatarFileName = await this.writeAvatar(avatarUri);
    return this.deps.repository.update({ avatarFileName });
  }

  private async tryWriteAvatar(avatarUri: string): Promise<string | null> {
    try {
      return await this.writeAvatar(avatarUri);
    } catch (error) {
      this.deps.logging?.warn('profile.avatar.write_failed', {
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * ADR-0012 write-then-commit ordering: the file is written and verified to
   * exist with a non-zero size before any caller here ever persists its name
   * to `user_profile.avatar_file_name`. The possible inconsistency this
   * leaves is an orphan file with no row pointing at it - benign, per the
   * ADR - never a row pointing at a file that isn't there.
   */
  private async writeAvatar(avatarUri: string): Promise<string> {
    const fileName = `avatar-${this.deps.idGenerator.generate()}.jpg`;
    const relativePath = `${AVATAR_DIRECTORY}/${fileName}`;

    await this.deps.files.copyFrom(avatarUri, relativePath);

    const size = await this.deps.files.size(relativePath);
    if (!size) {
      throw new Error(`Avatar copy produced no file (or a zero-byte file) at "${relativePath}".`);
    }

    return fileName;
  }
}
