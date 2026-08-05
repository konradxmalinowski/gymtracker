/**
 * snake_case (SQLite column names) <-> camelCase (TypeScript entity fields).
 * Shallow only, by design: nested JSON columns go through `codecs.ts` and come
 * back out as already-camelCase application objects, so a recursive case
 * converter would just be re-processing data that was never SQL in the first
 * place.
 */

export function snakeToCamel(input: string): string {
  return input.replace(/_([a-z0-9])/g, (_match, char: string) => char.toUpperCase());
}

export function camelToSnake(input: string): string {
  return input.replace(/([A-Z])/g, (char) => `_${char.toLowerCase()}`);
}

/** Converts every top-level key of a raw SQL row object from snake_case to camelCase. */
export function rowKeysToCamel<T extends Record<string, unknown>>(row: Record<string, unknown>): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    result[snakeToCamel(key)] = value;
  }
  return result as T;
}

/** Converts every top-level key of an entity/patch object from camelCase to snake_case. */
export function entityKeysToSnake<T extends Record<string, unknown>>(
  entity: Record<string, unknown>,
): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entity)) {
    result[camelToSnake(key)] = value;
  }
  return result as T;
}
