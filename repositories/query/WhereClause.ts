/**
 * Small, safe fragment builder for composing `WHERE` clauses - ARCHITECTURE.md
 * section 9 ("typed query builder for the filter-heavy list screens"). Every
 * caller-supplied *value* is always bound as a parameter, never concatenated
 * into the SQL string; column and direction names come only from fixed
 * whitelists the calling repository controls (never from user input), the same
 * reasoning `database/diagnostics.ts` documents for its own table-name
 * interpolation.
 *
 * This is a fragment composer, not a full query builder: it does not know about
 * `SELECT`/`FROM`/joins. Feature repositories (`ExerciseRepository`,
 * `PlanRepository`, ...) own their own base SQL and use these helpers only for
 * the caller-supplied filter portion.
 */
import type { SqlParam } from '@/repositories/contracts/database';

export interface WhereClause {
  readonly sql: string;
  readonly params: readonly SqlParam[];
}

/** Always matches every row - the identity element for `and()`/`or()`. */
export const ALWAYS: WhereClause = { sql: '1=1', params: [] };

/** Never matches any row - useful when a caller's filter (e.g. an empty `IN` list) can never be satisfied. */
export const NEVER: WhereClause = { sql: '1=0', params: [] };

export function eq(column: string, value: SqlParam): WhereClause {
  return { sql: `${column} = ?`, params: [value] };
}

export function neq(column: string, value: SqlParam): WhereClause {
  return { sql: `${column} != ?`, params: [value] };
}

export function isNull(column: string): WhereClause {
  return { sql: `${column} IS NULL`, params: [] };
}

export function isNotNull(column: string): WhereClause {
  return { sql: `${column} IS NOT NULL`, params: [] };
}

export function gte(column: string, value: SqlParam): WhereClause {
  return { sql: `${column} >= ?`, params: [value] };
}

export function lte(column: string, value: SqlParam): WhereClause {
  return { sql: `${column} <= ?`, params: [value] };
}

/**
 * A `LIKE` clause over an already-prepared pattern (the caller is responsible
 * for `%`/`_` wildcard placement - this only guarantees the pattern is bound,
 * never interpolated).
 */
export function like(column: string, pattern: string): WhereClause {
  return { sql: `${column} LIKE ?`, params: [pattern] };
}

/**
 * `column IN (...)`. Returns `NEVER` for an empty list rather than emitting
 * invalid SQL (`IN ()`) or silently matching everything.
 */
export function inList(column: string, values: readonly SqlParam[]): WhereClause {
  if (values.length === 0) {
    return NEVER;
  }
  return { sql: `${column} IN (${values.map(() => '?').join(', ')})`, params: values };
}

function combine(
  operator: 'AND' | 'OR',
  clauses: readonly (WhereClause | null | undefined)[],
): WhereClause {
  const present = clauses.filter((clause): clause is WhereClause => clause != null);
  if (present.length === 0) {
    return ALWAYS;
  }
  if (present.length === 1) {
    return present[0]!;
  }
  return {
    sql: present.map((clause) => `(${clause.sql})`).join(` ${operator} `),
    params: present.flatMap((clause) => clause.params),
  };
}

/** Combines clauses with `AND`, skipping any `null`/`undefined` (an "unset" optional filter). Empty input matches everything. */
export function and(...clauses: (WhereClause | null | undefined)[]): WhereClause {
  return combine('AND', clauses);
}

/** Combines clauses with `OR`, skipping any `null`/`undefined`. Empty input matches everything (identity, not "matches nothing"). */
export function or(...clauses: (WhereClause | null | undefined)[]): WhereClause {
  return combine('OR', clauses);
}

/** Renders a `WhereClause` as a full `WHERE ...` string, or `''` when the clause is `ALWAYS`. */
export function toWhereSql(clause: WhereClause): string {
  return clause === ALWAYS ? '' : `WHERE ${clause.sql}`;
}
