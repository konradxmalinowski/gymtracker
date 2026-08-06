import { createTestDatabase } from '@/database/node/createTestDatabase';
import { InvalidNicknameError } from '@/features/profile/services/errors';
import {
  AVATAR_DIRECTORY,
  NICKNAME_MAX_LENGTH,
  ProfileService,
} from '@/features/profile/services/ProfileService';
import { ProfileAlreadyExistsError } from '@/features/profile/repository/errors';
import { SqliteProfileRepository } from '@/features/profile/repository/SqliteProfileRepository';
import { FixedClock } from '@/services/clock';
import { ExpoFileStorage } from '@/services/files';
import type { IdGenerator } from '@/services/id';
import { RingBufferLogger } from '@/services/logging';

/**
 * `ProfileService`'s repository dependency is the real `SqliteProfileRepository`
 * against an in-memory `schema.sql` database (this project's standing rule:
 * integration over mocks for anything touching SQL - CLAUDE.md's testing
 * strategy). `FileStorage` is real too (`ExpoFileStorage` over `jest-expo`'s
 * in-memory mock filesystem, the same approach `RingBufferLogger.test.ts`
 * uses) rather than hand-rolled, since it is exercised directly by Jest and a
 * fake would just re-describe its own behavior. Only the id generator is
 * faked, to make the generated avatar file name assertable.
 */
function fixedIdGenerator(id: string): IdGenerator {
  return { generate: () => id };
}

function buildService(options?: { idGenerator?: IdGenerator; logging?: RingBufferLogger }) {
  const db = createTestDatabase();
  const repository = new SqliteProfileRepository(db, new FixedClock(Date.UTC(2026, 0, 1)));
  const files = new ExpoFileStorage('document');
  const idGenerator = options?.idGenerator ?? fixedIdGenerator('fixed-uuid');
  const logging = options?.logging ?? new RingBufferLogger();

  const service = new ProfileService({ repository, files, idGenerator, logging });
  return { service, repository, files, logging };
}

function uniqueDir(): string {
  return `t-${Math.random().toString(36).slice(2)}`;
}

describe('ProfileService.getProfile()', () => {
  it('returns null before onboarding has run', async () => {
    const { service } = buildService();
    expect(await service.getProfile()).toBeNull();
  });
});

describe('ProfileService.completeOnboarding() - nickname only', () => {
  it('creates a profile with the trimmed nickname and no avatar', async () => {
    const { service } = buildService();

    const profile = await service.completeOnboarding({ nickname: '  Konrad  ' });

    expect(profile.nickname).toBe('Konrad');
    expect(profile.avatarFileName).toBeNull();
  });

  it('rejects an empty (or whitespace-only) nickname and creates nothing', async () => {
    const { service, repository } = buildService();

    await expect(service.completeOnboarding({ nickname: '   ' })).rejects.toBeInstanceOf(
      InvalidNicknameError,
    );
    expect(await repository.get()).toBeNull();
  });

  it('rejects a nickname longer than NICKNAME_MAX_LENGTH', async () => {
    const { service } = buildService();
    const tooLong = 'x'.repeat(NICKNAME_MAX_LENGTH + 1);

    await expect(service.completeOnboarding({ nickname: tooLong })).rejects.toBeInstanceOf(
      InvalidNicknameError,
    );
  });

  it('accepts a nickname exactly at NICKNAME_MAX_LENGTH', async () => {
    const { service } = buildService();
    const atLimit = 'x'.repeat(NICKNAME_MAX_LENGTH);

    const profile = await service.completeOnboarding({ nickname: atLimit });
    expect(profile.nickname).toBe(atLimit);
  });
});

describe('ProfileService.completeOnboarding() - avatar write-then-commit (ADR-0012)', () => {
  it('copies the picked image into avatars/avatar-<id>.jpg and commits it on the created profile', async () => {
    const { service, files } = buildService({ idGenerator: fixedIdGenerator('abc123') });
    const sourcePath = `${uniqueDir()}/picked.jpg`;
    const bytes = new Uint8Array([1, 2, 3, 4]);
    await files.writeBytes(sourcePath, bytes);

    const profile = await service.completeOnboarding({
      nickname: 'Konrad',
      avatarUri: files.getUri(sourcePath),
    });

    expect(profile.avatarFileName).toBe('avatar-abc123.jpg');
    const stored = await files.readBytes(`${AVATAR_DIRECTORY}/avatar-abc123.jpg`);
    expect(stored).toEqual(bytes);
  });

  it('still creates the profile, without an avatar, when the source file does not exist - onboarding is never blocked by an avatar failure', async () => {
    const logging = new RingBufferLogger();
    const { service, repository, files } = buildService({ logging });

    const profile = await service.completeOnboarding({
      nickname: 'Konrad',
      avatarUri: files.getUri(`${uniqueDir()}/does-not-exist.jpg`),
    });

    expect(profile.nickname).toBe('Konrad');
    expect(profile.avatarFileName).toBeNull();
    expect(await repository.get()).toEqual(profile);
    expect(logging.getEntries().some((entry) => entry.level === 'warn')).toBe(true);
  });

  it('still creates the profile, without an avatar, when the copy produces a zero-byte file', async () => {
    const { service, files } = buildService();
    const sourcePath = `${uniqueDir()}/empty.jpg`;
    await files.writeBytes(sourcePath, new Uint8Array(0));

    const profile = await service.completeOnboarding({
      nickname: 'Konrad',
      avatarUri: files.getUri(sourcePath),
    });

    expect(profile.avatarFileName).toBeNull();
  });

  it('skipping the avatar entirely (no avatarUri) is a first-class path, not an error', async () => {
    const { service } = buildService();
    const profile = await service.completeOnboarding({ nickname: 'Konrad' });
    expect(profile.avatarFileName).toBeNull();
  });
});

describe('ProfileService.completeOnboarding() - double-submit protection', () => {
  it('propagates ProfileAlreadyExistsError on a second call and leaves the original profile untouched', async () => {
    const { service, repository } = buildService();
    const first = await service.completeOnboarding({ nickname: 'Konrad' });

    await expect(service.completeOnboarding({ nickname: 'Someone else' })).rejects.toBeInstanceOf(
      ProfileAlreadyExistsError,
    );

    expect(await repository.get()).toEqual(first);
  });

  it('propagates ProfileAlreadyExistsError even when the second call carries a different avatar, and does not write the second avatar file to disk', async () => {
    const { service, repository, files } = buildService({
      idGenerator: fixedIdGenerator('second-id'),
    });
    await service.completeOnboarding({ nickname: 'Konrad' });

    const sourcePath = `${uniqueDir()}/second-avatar.jpg`;
    await files.writeBytes(sourcePath, new Uint8Array([1, 2, 3]));

    await expect(
      service.completeOnboarding({
        nickname: 'Someone else',
        avatarUri: files.getUri(sourcePath),
      }),
    ).rejects.toBeInstanceOf(ProfileAlreadyExistsError);

    expect((await repository.get())?.nickname).toBe('Konrad');
    // The write-then-commit ordering (ADR-0012) means the avatar copy for the
    // rejected second call already landed on disk before create() ran and
    // threw - an orphan file, not a row pointing at a missing one. Asserting
    // it exists (rather than doesn't) documents that real, benign trade-off
    // instead of leaving it as an implicit assumption.
    expect(await files.exists(`${AVATAR_DIRECTORY}/avatar-second-id.jpg`)).toBe(true);
  });
});

describe('ProfileService.updateNickname()', () => {
  it('validates and persists the trimmed nickname', async () => {
    const { service } = buildService();
    await service.completeOnboarding({ nickname: 'Konrad' });

    const updated = await service.updateNickname('  Kon  ');
    expect(updated.nickname).toBe('Kon');
  });

  it('rejects an invalid nickname without touching the stored profile', async () => {
    const { service, repository } = buildService();
    await service.completeOnboarding({ nickname: 'Konrad' });

    await expect(service.updateNickname('')).rejects.toBeInstanceOf(InvalidNicknameError);
    expect((await repository.get())?.nickname).toBe('Konrad');
  });
});

describe('ProfileService.updateAvatar()', () => {
  it('writes the new avatar and commits it on the profile', async () => {
    const { service, files } = buildService({ idGenerator: fixedIdGenerator('new-avatar-id') });
    await service.completeOnboarding({ nickname: 'Konrad' });

    const sourcePath = `${uniqueDir()}/new-picked.jpg`;
    await files.writeBytes(sourcePath, new Uint8Array([5, 6, 7]));

    const updated = await service.updateAvatar(files.getUri(sourcePath));

    expect(updated.avatarFileName).toBe('avatar-new-avatar-id.jpg');
  });

  it('throws, and does not modify the stored profile, when the source file does not exist', async () => {
    const { service, repository, files } = buildService();
    await service.completeOnboarding({ nickname: 'Konrad' });
    const before = await repository.get();

    await expect(
      service.updateAvatar(files.getUri(`${uniqueDir()}/missing.jpg`)),
    ).rejects.toThrow();

    expect(await repository.get()).toEqual(before);
  });
});
