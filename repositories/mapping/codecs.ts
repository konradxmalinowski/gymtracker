/**
 * Row <-> entity codecs - ARCHITECTURE.md section 8 / section 7.1 global
 * conventions. SQLite stores booleans as `INTEGER (0,1)` and structured values as
 * JSON strings (`exercise.aliases`, `exercise.instructions`, ...); every feature
 * repository converts through these instead of re-deriving the same
 * `=== 1`/`JSON.parse` one-liner per column.
 */
import type { SqlParam } from '@/repositories/contracts/database';

/** `INTEGER (0,1)` column -> `boolean`. Treats anything other than `1` as `false`. */
export function boolFromSql(value: number | null | undefined): boolean {
  return value === 1;
}

/** `boolean` -> the `INTEGER (0,1)` SQLite expects. */
export function boolToSql(value: boolean): 0 | 1 {
  return value ? 1 : 0;
}

/** Nullable variant: `NULL` stays `null` rather than coercing to `false`. */
export function nullableBoolFromSql(value: number | null | undefined): boolean | null {
  return value === null || value === undefined ? null : boolFromSql(value);
}

export function nullableBoolToSql(value: boolean | null | undefined): 0 | 1 | null {
  return value === null || value === undefined ? null : boolToSql(value);
}

/**
 * JSON-string column -> parsed value, falling back to `fallback` on a missing or
 * corrupt value rather than throwing - the same "never crash on bad stored data"
 * rule `SettingsRepository` applies to `app_setting.value`.
 */
export function jsonFromSql<T>(value: string | null | undefined, fallback: T): T {
  if (value === null || value === undefined) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Value -> the JSON-string column SQLite expects. */
export function jsonToSql(value: unknown): string {
  return JSON.stringify(value);
}

/** `SqlParam`-safe variant of `jsonToSql` for use directly in a params array. */
export function jsonParam(value: unknown): SqlParam {
  return JSON.stringify(value);
}
