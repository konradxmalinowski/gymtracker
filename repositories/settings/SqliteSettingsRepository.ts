import type { DatabaseContext, SqlExecutor } from '@/repositories/contracts/database';
import type { Clock } from '@/services/clock';
import { InvalidSettingValueError } from './errors';
import type { SettingsRepository } from './SettingsRepository';
import {
  getSettingDefault,
  SETTINGS_SCHEMA,
  type SettingsKey,
  type SettingsValue,
} from './settingsSchema';

interface AppSettingRow {
  value: string;
}

/**
 * `app_setting` is `key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER
 * NOT NULL` (ARCHITECTURE.md section 7.3). `value` is always a JSON-encoded
 * scalar - `db.run(app_setting, ..., JSON.stringify(x), ...)` - matching how
 * `database/seed/catalogSeeder.ts` already reads/writes `catalog.version` on the
 * same table via raw SQL before this repository (or any container) exists.
 */
export class SqliteSettingsRepository implements SettingsRepository {
  constructor(
    private readonly db: DatabaseContext,
    private readonly clock: Clock,
  ) {}

  async get<K extends SettingsKey>(key: K, tx?: SqlExecutor): Promise<SettingsValue<K>> {
    const executor = tx ?? this.db;
    const entry = SETTINGS_SCHEMA[key];
    const row = await executor.selectOne<AppSettingRow>(
      'SELECT value FROM app_setting WHERE key = ?',
      [key],
    );
    if (!row) {
      return getSettingDefault(key);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(row.value);
    } catch {
      return getSettingDefault(key);
    }

    const result = entry.schema.safeParse(parsed);
    return result.success ? (result.data as SettingsValue<K>) : getSettingDefault(key);
  }

  async set<K extends SettingsKey>(
    key: K,
    value: SettingsValue<K>,
    tx?: SqlExecutor,
  ): Promise<void> {
    const executor = tx ?? this.db;
    const entry = SETTINGS_SCHEMA[key];
    const result = entry.schema.safeParse(value);
    if (!result.success) {
      throw new InvalidSettingValueError(key, result.error.issues);
    }

    const now = this.clock.now();
    await executor.run(
      `INSERT INTO app_setting (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, JSON.stringify(result.data), now],
    );
  }
}
