import type { SqlExecutor } from '@/repositories/contracts/database';
import type { SettingsKey, SettingsValue } from './settingsSchema';

/**
 * ARCHITECTURE.md section 8.3 / 7.3. Deliberately does not implement
 * `ReadRepository`/`WriteRepository` (`repositories/contracts/repository.ts`):
 * those contracts assume a UUID-keyed, soft-deletable entity, and `app_setting`
 * is a natural-key `key -> value` table with no concept of deletion - a setting
 * is overwritten or left at its default, never "soft deleted" and restored.
 * Modeling it as one would mean bending the shape to fit a contract that doesn't
 * describe it.
 */
export interface SettingsRepository {
  /** Always returns a value: the key's default when nothing has been stored, or when the stored value is missing/corrupt/invalid. */
  get<K extends SettingsKey>(key: K, tx?: SqlExecutor): Promise<SettingsValue<K>>;
  /** @throws {InvalidSettingValueError} when `value` fails the key's Zod schema. */
  set<K extends SettingsKey>(key: K, value: SettingsValue<K>, tx?: SqlExecutor): Promise<void>;
}
