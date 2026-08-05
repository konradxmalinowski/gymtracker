/**
 * MMKV key inventory - ADR-0008 "MMKV key inventory". This is deliberately a
 * small, fixed set: MMKV only ever holds boot-critical flags read before SQLite
 * opens, or synchronous mirrors of a `SETTINGS_SCHEMA` value SQLite already owns.
 * Anything else belongs in SQLite (source of truth) or Zustand (ephemeral UI
 * state), never here - see the boundary table in that ADR.
 */
export interface KvSchema {
  /** Set once onboarding finishes; read by the splash gate to decide routing. */
  'onboarding.completed': boolean;
  /** Mirrors whether `workout_session` has an `in_progress` row. */
  'session.active': boolean;
  /** The in-progress `workout_session.id`, when `session.active` is true. */
  'session.activeId': string;
  /** Mirrors the `catalog.version` app setting for the boot-time seeder check. */
  'catalog.version': string;
  /** Mirrors the `units.weight` app setting for synchronous render-time reads. */
  'units.weight': 'kg' | 'lb';
  /** Mirrors the `units.length` app setting for synchronous render-time reads. */
  'units.length': 'cm' | 'in';
  /** Mirrors the haptics-enabled setting `services/haptics` currently reads locally. */
  'haptics.enabled': boolean;
}

export type KvKey = keyof KvSchema;
