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
  // P9 addition (docs/ROADMAP.md, D-04): shows an estimated-calories figure
  // on the workout summary screen when on. Off by default - the estimate is
  // a flat kcal-per-minute constant with no bodyweight input
  // (`features/workout-logging/domain/EstimatedCalories.ts`,
  // `docs/adr/0018-estimated-calories-formula.md`), so it's opt-in rather
  // than shown unconditionally.
  'workout.showEstimatedCalories': { schema: z.boolean(), default: false },
  'oneRm.formula': { schema: z.enum(['epley', 'brzycki']), default: 'epley' },
  'progression.upperIncrementKg': { schema: z.number().positive(), default: 2.5 },
  // ADR-0015 Decision 2: 5 kg default for lower-body movements (a squat or
  // deadlift can absorb a much bigger jump than an upper-body accessory
  // lift). Was 1.25 until P8 pass 1 caught the mismatch against the ADR's
  // own prose and worked example - a real bug, not a P8 scope decision.
  'progression.lowerIncrementKg': { schema: z.number().positive(), default: 5 },
  'catalog.version': { schema: z.string().min(1), default: '0' },
  'diagnostics.crashReporting': { schema: z.boolean(), default: false },
  // P3 addition (docs/ROADMAP.md): global haptics toggle read by
  // services/haptics's semantic wrapper, which no-ops every call when this is
  // off. Additive-only, per this file's own header comment - app_setting is
  // schema-less key/value specifically so a new setting never needs a migration.
  'haptics.enabled': { schema: z.boolean(), default: true },
  // Gravitus-inspired refresh: the plate calculator's configurable inputs -
  // additive, same "no migration needed" reasoning as every other setting in
  // this file. `availablePlatesKg` is the first array-shaped setting this
  // schema has ever needed; `app_setting.value` is already a JSON-encoded
  // scalar (this file's own module comment), so a JSON array round-trips
  // through `SqliteSettingsRepository` with no repository change at all -
  // only this schema entry.
  'plateCalculator.barWeightKg': { schema: z.number().positive(), default: 20 },
  'plateCalculator.ezBarWeightKg': { schema: z.number().positive(), default: 10 },
  'plateCalculator.availablePlatesKg': {
    schema: z.array(z.number().positive()).min(1),
    default: [25, 20, 15, 10, 5, 2.5, 1.25],
  },
  // Gravitus-inspired refresh: local, offline-only weekly workout reminders
  // (`services/notifications/WorkoutReminderService.ts`) - `days` is a plain
  // array of 0-6 weekday ints (0 = Sunday, matching JS `Date.getDay()`),
  // JSON-encoded the same way `plateCalculator.availablePlatesKg` above is.
  'reminders.enabled': { schema: z.boolean(), default: false },
  'reminders.days': {
    schema: z
      .array(z.number().int().min(0).max(6))
      .max(7)
      .refine((days) => new Set(days).size === days.length, {
        message: 'Expected no duplicate weekdays',
      }),
    default: [],
  },
  'reminders.time': {
    schema: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm'),
    default: '18:00',
  },
} as const;

export const SETTINGS_SCHEMA: {
  readonly [K in keyof typeof settingsSchemaDefinition]: (typeof settingsSchemaDefinition)[K];
} = settingsSchemaDefinition;

export type SettingsKey = keyof typeof SETTINGS_SCHEMA;

export type SettingsValue<K extends SettingsKey> = z.infer<(typeof SETTINGS_SCHEMA)[K]['schema']>;

export function getSettingDefault<K extends SettingsKey>(key: K): SettingsValue<K> {
  return SETTINGS_SCHEMA[key].default as SettingsValue<K>;
}
