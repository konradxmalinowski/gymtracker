import { createTestDatabase } from '@/database/node/createTestDatabase';
import {
  InvalidSettingValueError,
  SETTINGS_SCHEMA,
  SqliteSettingsRepository,
  type SettingsKey,
} from '@/repositories/settings';
import { FixedClock } from '@/services/clock';

const ALL_KEYS = Object.keys(SETTINGS_SCHEMA) as SettingsKey[];

describe('SETTINGS_SCHEMA', () => {
  it('covers every known v1 setting key from ARCHITECTURE.md section 7.3', () => {
    expect(new Set(ALL_KEYS)).toEqual(
      new Set([
        'units.weight',
        'units.length',
        'timer.defaultRestSeconds',
        'timer.sound',
        'timer.vibration',
        'timer.notification',
        'timer.autoStart',
        'workout.staleAfterHours',
        'workout.confirmDiscard',
        'oneRm.formula',
        'progression.upperIncrementKg',
        'progression.lowerIncrementKg',
        'catalog.version',
        'diagnostics.crashReporting',
        'haptics.enabled',
      ]),
    );
  });

  it('every default value satisfies its own schema', () => {
    for (const key of ALL_KEYS) {
      const entry = SETTINGS_SCHEMA[key];
      const result = entry.schema.safeParse(entry.default);
      expect(result.success).toBe(true);
    }
  });
});

describe('SqliteSettingsRepository.get() - default fallback', () => {
  it('returns the schema default when nothing has been stored, for every key', async () => {
    const db = createTestDatabase();
    const repo = new SqliteSettingsRepository(db, new FixedClock(0));

    for (const key of ALL_KEYS) {
      const value = await repo.get(key);
      expect(value).toEqual(SETTINGS_SCHEMA[key].default);
    }
  });

  it('returns the default when the stored value is not valid JSON', async () => {
    const db = createTestDatabase();
    const repo = new SqliteSettingsRepository(db, new FixedClock(0));
    await db.run('INSERT INTO app_setting (key, value, updated_at) VALUES (?, ?, ?)', [
      'timer.defaultRestSeconds',
      'not json{{',
      0,
    ]);

    expect(await repo.get('timer.defaultRestSeconds')).toBe(90);
  });

  it('returns the default when the stored value is valid JSON but fails the schema', async () => {
    const db = createTestDatabase();
    const repo = new SqliteSettingsRepository(db, new FixedClock(0));
    await db.run('INSERT INTO app_setting (key, value, updated_at) VALUES (?, ?, ?)', [
      'units.weight',
      JSON.stringify('stone'), // not in the ('kg','lb') enum
      0,
    ]);

    expect(await repo.get('units.weight')).toBe('kg');
  });
});

function sampleFor(key: SettingsKey): unknown {
  switch (key) {
    case 'units.weight':
      return 'lb';
    case 'units.length':
      return 'in';
    case 'timer.defaultRestSeconds':
      return 120;
    case 'timer.sound':
    case 'timer.vibration':
    case 'timer.notification':
    case 'timer.autoStart':
    case 'workout.confirmDiscard':
    case 'diagnostics.crashReporting':
    case 'haptics.enabled':
      return false;
    case 'workout.staleAfterHours':
      return 12;
    case 'oneRm.formula':
      return 'brzycki';
    case 'progression.upperIncrementKg':
      return 5;
    case 'progression.lowerIncrementKg':
      return 2.5;
    case 'catalog.version':
      return '42';
  }
}

describe('SqliteSettingsRepository.set() / get() - round-trip for every known key', () => {
  it.each(ALL_KEYS)('round-trips a valid value for "%s"', async (key) => {
    const db = createTestDatabase();
    const repo = new SqliteSettingsRepository(db, new FixedClock(1_000));
    const value = sampleFor(key);

    await repo.set(key, value as never);
    expect(await repo.get(key)).toEqual(value);
  });

  it('overwrites a previously stored value and bumps updated_at', async () => {
    const db = createTestDatabase();
    const clock = new FixedClock(1_000);
    const repo = new SqliteSettingsRepository(db, clock);

    await repo.set('timer.defaultRestSeconds', 60);
    expect(await repo.get('timer.defaultRestSeconds')).toBe(60);

    clock.set(2_000);
    await repo.set('timer.defaultRestSeconds', 180);
    expect(await repo.get('timer.defaultRestSeconds')).toBe(180);

    const row = await db.selectOne<{ updated_at: number }>(
      'SELECT updated_at FROM app_setting WHERE key = ?',
      ['timer.defaultRestSeconds'],
    );
    expect(row?.updated_at).toBe(2_000);
  });

  it("stays compatible with catalogSeeder.ts's raw-SQL access to the same app_setting row", async () => {
    const db = createTestDatabase();
    const repo = new SqliteSettingsRepository(db, new FixedClock(0));

    // Simulates catalogSeeder.ts writing catalog.version directly (see its own
    // setAppSetting helper) before any container/repository exists.
    await db.run(
      `INSERT INTO app_setting (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ['catalog.version', JSON.stringify('7'), 0],
    );

    expect(await repo.get('catalog.version')).toBe('7');
  });
});

describe('SqliteSettingsRepository.set() - rejects invalid writes', () => {
  it('throws InvalidSettingValueError and does not persist anything', async () => {
    const db = createTestDatabase();
    const repo = new SqliteSettingsRepository(db, new FixedClock(0));

    await expect(repo.set('units.weight', 'stone' as never)).rejects.toBeInstanceOf(
      InvalidSettingValueError,
    );
    expect(await repo.get('units.weight')).toBe('kg');

    const row = await db.selectOne('SELECT 1 FROM app_setting WHERE key = ?', ['units.weight']);
    expect(row).toBeNull();
  });

  it('rejects an out-of-range number', async () => {
    const db = createTestDatabase();
    const repo = new SqliteSettingsRepository(db, new FixedClock(0));

    await expect(repo.set('timer.defaultRestSeconds', 99999 as never)).rejects.toBeInstanceOf(
      InvalidSettingValueError,
    );
  });

  it('the error carries the key and the Zod issues', async () => {
    const db = createTestDatabase();
    const repo = new SqliteSettingsRepository(db, new FixedClock(0));

    try {
      await repo.set('oneRm.formula', 'lombardi' as never);
      throw new Error('expected set() to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidSettingValueError);
      const invalid = error as InvalidSettingValueError;
      expect(invalid.key).toBe('oneRm.formula');
      expect(invalid.issues.length).toBeGreaterThan(0);
    }
  });
});

describe('SqliteSettingsRepository - tx composition', () => {
  it('honors an explicit tx and rolls back with the caller-managed transaction', async () => {
    const db = createTestDatabase();
    const repo = new SqliteSettingsRepository(db, new FixedClock(0));

    await expect(
      db.transaction(async (tx) => {
        await repo.set('timer.defaultRestSeconds', 45, tx);
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    expect(await repo.get('timer.defaultRestSeconds')).toBe(90);
  });
});
