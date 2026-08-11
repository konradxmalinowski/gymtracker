/**
 * `SETTINGS_SCHEMA` - ARCHITECTURE.md section 7.3: every known `app_setting.key`
 * at v1, each mapped to a Zod schema and a default. This is what makes
 * `settings.get('timer.defaultRestSeconds')` fully typed (`SettingsValue<K>`
 * below) and what lets a missing or corrupt stored value fall back to a default
 * instead of crashing (`SqliteSettingsRepository`).
 *
 * `catalog.version`'s schema/default here must stay compatible with
 * `database/seed/catalogSeeder.ts`, which reads and writes the same
 * `app_setting` row directly via raw SQL (it runs before a container exists, at
 * boot) - both sides store the value JSON-encoded, so `z.string()` round-trips
 * whatever version string the seeder wrote.
 */
import { z } from 'zod';

/**
 * `timer.defaultRestSeconds`'s bounds, named and exported so every other
 * place a rest-duration value needs the same [5, 1800] range - P7's
 * per-exercise `session_exercise.rest_seconds_override` validation
 * (`WorkoutSessionService.setExerciseRestOverride`) and the rest-timer bar's
 * own delta-adjust clamp (`features/workout-logging/hooks/useRestTimer.ts`)
 * - imports the same two numbers instead of each re-declaring its own copy
 * that a future bound change could silently desync from this one.
 */
export const REST_SECONDS_MIN = 5;
export const REST_SECONDS_MAX = 1800;

const settingsSchemaDefinition = {
  'units.weight': { schema: z.enum(['kg', 'lb']), default: 'kg' },
  'units.length': { schema: z.enum(['cm', 'in']), default: 'cm' },
  'timer.defaultRestSeconds': {
    schema: z.number().int().min(REST_SECONDS_MIN).max(REST_SECONDS_MAX),
    default: 90,
  },
  'timer.sound': { schema: z.boolean(), default: true },
  'timer.vibration': { schema: z.boolean(), default: true },
  'timer.notification': { schema: z.boolean(), default: true },
  'timer.autoStart': { schema: z.boolean(), default: true },
  'workout.staleAfterHours': { schema: z.number().int().min(1).max(72), default: 6 },
  'workout.confirmDiscard': { schema: z.boolean(), default: true },
  'oneRm.formula': { schema: z.enum(['epley', 'brzycki']), default: 'epley' },
  'progression.upperIncrementKg': { schema: z.number().positive(), default: 2.5 },
  'progression.lowerIncrementKg': { schema: z.number().positive(), default: 1.25 },
  'catalog.version': { schema: z.string().min(1), default: '0' },
  'diagnostics.crashReporting': { schema: z.boolean(), default: false },
  // P3 addition (docs/ROADMAP.md): global haptics toggle read by
  // services/haptics's semantic wrapper, which no-ops every call when this is
  // off. Additive-only, per this file's own header comment - app_setting is
  // schema-less key/value specifically so a new setting never needs a migration.
  'haptics.enabled': { schema: z.boolean(), default: true },
} as const;

export const SETTINGS_SCHEMA: {
  readonly [K in keyof typeof settingsSchemaDefinition]: (typeof settingsSchemaDefinition)[K];
} = settingsSchemaDefinition;

export type SettingsKey = keyof typeof SETTINGS_SCHEMA;

export type SettingsValue<K extends SettingsKey> = z.infer<(typeof SETTINGS_SCHEMA)[K]['schema']>;

export function getSettingDefault<K extends SettingsKey>(key: K): SettingsValue<K> {
  return SETTINGS_SCHEMA[key].default as SettingsValue<K>;
}
