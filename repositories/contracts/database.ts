/**
 * Shared database contracts - ARCHITECTURE.md section 8.2.
 *
 * `SqlExecutor` is the seam that makes repositories testable in Node against
 * `better-sqlite3`/`node:sqlite` while running on `expo-sqlite` on device (ADR-0014
 * part 1). No repository, service or feature module may depend on `expo-sqlite`
 * directly - only on this interface. `database/client.ts` (`ExpoSqlExecutor`) and
 * `database/node/NodeSqlExecutor.ts` (`NodeSqlExecutor`) are the only two
 * implementations that should ever exist.
 */

/** A value that can be bound to a `?` placeholder in a SQL statement. */
export type SqlParam = string | number | null | Uint8Array;

export interface SqlExecutor {
  select<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
  selectOne<T>(sql: string, params?: SqlParam[]): Promise<T | null>;
  run(sql: string, params?: SqlParam[]): Promise<{ changes: number }>;
  batch(statements: readonly { sql: string; params?: SqlParam[] }[]): Promise<void>;
}

export interface DatabaseContext extends SqlExecutor {
  /** Runs fn inside a transaction. Nested calls join the outer transaction. */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}
