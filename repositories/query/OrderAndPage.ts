/**
 * `ORDER BY` and `LIMIT/OFFSET` fragment helpers - the other half of
 * `WhereClause.ts`. Column names cannot be bound as `?` parameters in SQLite, so
 * `buildOrderBy` validates every requested column against a fixed whitelist the
 * calling repository provides, rather than trusting caller input directly.
 */
import type { SqlParam } from '@/repositories/contracts/database';

export type SortDirection = 'ASC' | 'DESC';

export interface OrderSpec {
  readonly column: string;
  readonly direction: SortDirection;
}

/**
 * @throws if a requested column is not in `allowedColumns` - a caller-controlled
 * sort column is exactly the kind of value that must never reach raw SQL
 * unchecked.
 */
export function buildOrderBy(
  orders: readonly OrderSpec[],
  allowedColumns: readonly string[],
): string {
  if (orders.length === 0) {
    return '';
  }
  const allowed = new Set(allowedColumns);
  const fragments = orders.map(({ column, direction }) => {
    if (!allowed.has(column)) {
      throw new Error(`Column "${column}" is not sortable on this query.`);
    }
    return `${column} ${direction}`;
  });
  return `ORDER BY ${fragments.join(', ')}`;
}

export interface Pagination {
  readonly limit: number;
  readonly offset: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Clamps `limit` to `(0, MAX_LIMIT]` and `offset` to `>= 0`, matching the
 * "never return unbounded lists" rule every list endpoint follows. Returns the
 * `LIMIT ? OFFSET ?` SQL fragment and its bound params together so a caller
 * cannot use one without the other.
 */
export function buildLimitOffset(pagination?: Partial<Pagination>): {
  sql: string;
  params: readonly SqlParam[];
  limit: number;
  offset: number;
} {
  const limit = clamp(pagination?.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = Math.max(0, pagination?.offset ?? 0);
  return { sql: 'LIMIT ? OFFSET ?', params: [limit, offset], limit, offset };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}
