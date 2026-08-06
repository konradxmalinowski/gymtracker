import { createTestDatabase } from '@/database/node/createTestDatabase';
import {
  ProfileAlreadyExistsError,
  ProfileNotFoundError,
} from '@/features/profile/repository/errors';
import type { ProfileSex } from '@/features/profile/repository/ProfileRepository';
import { SqliteProfileRepository } from '@/features/profile/repository/SqliteProfileRepository';
import { FixedClock } from '@/services/clock';

describe('SqliteProfileRepository.get() - fresh install', () => {
  it('returns null when onboarding has never run', async () => {
    const db = createTestDatabase();
    const repo = new SqliteProfileRepository(db, new FixedClock(0));

    expect(await repo.get()).toBeNull();
  });
});

describe('SqliteProfileRepository.create()', () => {
  it('creates the singleton profile row with the given nickname and null optional fields', async () => {
    const db = createTestDatabase();
    const clock = new FixedClock(Date.UTC(2026, 0, 1, 12));
    const repo = new SqliteProfileRepository(db, clock);

    const profile = await repo.create({ nickname: 'Konrad' });

    expect(profile).toEqual({
      id: 'local',
      nickname: 'Konrad',
      avatarFileName: null,
      birthDate: null,
      sex: null,
      createdAt: clock.now(),
      updatedAt: clock.now(),
    });
    expect(await repo.get()).toEqual(profile);
  });

  it('persists optional fields when provided', async () => {
    const db = createTestDatabase();
    const repo = new SqliteProfileRepository(db, new FixedClock(1_000));

    const profile = await repo.create({
      nickname: 'Konrad',
      avatarFileName: 'avatar-abc.jpg',
      birthDate: '1995-06-15',
      sex: 'male',
    });

    expect(profile.avatarFileName).toBe('avatar-abc.jpg');
    expect(profile.birthDate).toBe('1995-06-15');
    expect(profile.sex).toBe('male');
  });

  it('rejects a second create() - the singleton invariant', async () => {
    const db = createTestDatabase();
    const repo = new SqliteProfileRepository(db, new FixedClock(0));
    await repo.create({ nickname: 'Konrad' });

    await expect(repo.create({ nickname: 'Someone else' })).rejects.toBeInstanceOf(
      ProfileAlreadyExistsError,
    );
    // The original profile is untouched.
    expect((await repo.get())?.nickname).toBe('Konrad');
  });

  it('rejects a sex value outside the schema CHECK constraint even past the TypeScript type', async () => {
    const db = createTestDatabase();
    const repo = new SqliteProfileRepository(db, new FixedClock(0));

    await expect(repo.create({ nickname: 'Konrad', sex: 'other' as ProfileSex })).rejects.toThrow();
    expect(await repo.get()).toBeNull();
  });
});

describe('SqliteProfileRepository.update()', () => {
  it('updates only the given fields and bumps updated_at without touching created_at', async () => {
    const db = createTestDatabase();
    const clock = new FixedClock(Date.UTC(2026, 0, 1, 12));
    const repo = new SqliteProfileRepository(db, clock);
    const created = await repo.create({ nickname: 'Konrad' });

    clock.advance(60_000);
    const updated = await repo.update({ nickname: 'Kon' });

    expect(updated.nickname).toBe('Kon');
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.updatedAt).toBe(clock.now());
    expect(updated.updatedAt).toBeGreaterThan(created.updatedAt);
  });

  it('updates avatarFileName independently of nickname', async () => {
    const db = createTestDatabase();
    const repo = new SqliteProfileRepository(db, new FixedClock(0));
    await repo.create({ nickname: 'Konrad' });

    const updated = await repo.update({ avatarFileName: 'avatar-xyz.jpg' });

    expect(updated.avatarFileName).toBe('avatar-xyz.jpg');
    expect(updated.nickname).toBe('Konrad');
  });

  it('clears an optional field by passing null explicitly', async () => {
    const db = createTestDatabase();
    const repo = new SqliteProfileRepository(db, new FixedClock(0));
    await repo.create({ nickname: 'Konrad', avatarFileName: 'avatar-old.jpg' });

    const updated = await repo.update({ avatarFileName: null });

    expect(updated.avatarFileName).toBeNull();
  });

  it('an empty patch on an existing profile returns it unchanged and does not bump updated_at', async () => {
    const db = createTestDatabase();
    const clock = new FixedClock(1_000);
    const repo = new SqliteProfileRepository(db, clock);
    const created = await repo.create({ nickname: 'Konrad' });

    clock.advance(1_000);
    const result = await repo.update({});

    expect(result).toEqual(created);
  });

  it('throws ProfileNotFoundError when no profile exists yet', async () => {
    const db = createTestDatabase();
    const repo = new SqliteProfileRepository(db, new FixedClock(0));

    await expect(repo.update({ nickname: 'Konrad' })).rejects.toBeInstanceOf(ProfileNotFoundError);
  });

  it('an empty patch also throws ProfileNotFoundError when no profile exists yet', async () => {
    const db = createTestDatabase();
    const repo = new SqliteProfileRepository(db, new FixedClock(0));

    await expect(repo.update({})).rejects.toBeInstanceOf(ProfileNotFoundError);
  });
});

describe('SqliteProfileRepository - tx composition', () => {
  it('honors an explicit tx and rolls back with the caller-managed transaction', async () => {
    const db = createTestDatabase();
    const repo = new SqliteProfileRepository(db, new FixedClock(0));

    await expect(
      db.transaction(async (tx) => {
        await repo.create({ nickname: 'Konrad' }, tx);
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    expect(await repo.get()).toBeNull();
  });
});
