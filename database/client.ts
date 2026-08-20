import * as SQLite from 'expo-sqlite';
import type { DatabaseContext, SqlExecutor, SqlParam } from '@/repositories/contracts/database';

export const DATABASE_NAME = 'gymtracker.db';

/**
 * Pragmas set on every connection open - ARCHITECTURE.md section 7.1.
 * `synchronous=FULL` is a deliberate choice for FR-19 (crash-safe active workout);
 * rationale in ADR-0005.
 */
const CONNECTION_PRAGMAS: readonly string[] = [
  'PRAGMA journal_mode = WAL',
  'PRAGMA synchronous = FULL',
  'PRAGMA foreign_keys = ON',
  'PRAGMA busy_timeout = 5000',
  'PRAGMA temp_store = MEMORY',
];

/**
 * `finalizeUnusedStatementsBeforeClosing: false` works around a native crash
 * (`Scudo ERROR: invalid chunk state when deallocating` inside
 * `exsqlite3_finalize`) confirmed on real Android hardware -
 * https://github.com/expo/expo/issues/38168. This app never calls
 * `closeAsync()` itself, so this only matters for `expo-sqlite`'s own
 * reload-time cleanup (Metro Fast Refresh / dev-client reload), which caches
 * an open connection by database name and tears it down on reload. That
 * default (`true`) close path walks every open statement via
 * `sqlite3_next_stmt` and finalizes it directly; this schema's FTS5 virtual
 * table (`exercise_fts`, see `database/schema.sql`) finalizes its own
 * internally-owned statements as part of its own `sqlite3_close()` cleanup,
 * and the double finalize is the double-free. Setting this option to `false`
 * skips that pre-close finalization pass and leaves cleanup to SQLite's own
 * `sqlite3_close()`, which does not double-finalize the virtual table's
 * statements.
 */
export async function openDatabase(name: string = DATABASE_NAME): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(name, {
    finalizeUnusedStatementsBeforeClosing: false,
  });
  for (const pragma of CONNECTION_PRAGMAS) {
    await db.execAsync(pragma);
  }
  return db;
}

type ConnectionHandle = Pick<SQLite.SQLiteDatabase, 'runAsync' | 'getAllAsync' | 'getFirstAsync'>;

function bindParams(params?: SqlParam[]): SQLite.SQLiteBindParams {
  return (params ?? []) as SQLite.SQLiteBindParams;
}

/**
 * `SqlExecutor`/`DatabaseContext` implementation over `expo-sqlite` -
 * ARCHITECTURE.md section 8.2. This is the on-device counterpart of
 * `database/node/NodeSqlExecutor.ts`; both must behave identically from a caller's
 * point of view (ADR-0014 part 1's "residual risk" note).
 *
 * Transaction nesting: `transaction()` calls made while already inside a
 * transaction join the outer one rather than opening a new native transaction
 * (expo-sqlite does not support nested `BEGIN`). This is tracked via `txState`, a
 * mutable box shared by every executor bound to this instance's underlying
 * connection.
 */
export class ExpoSqlExecutor implements DatabaseContext {
  private readonly txState: { current: SqlExecutor | null } = { current: null };

  constructor(private readonly db: SQLite.SQLiteDatabase) {}

  select<T>(sql: string, params?: SqlParam[]): Promise<T[]> {
    return this.db.getAllAsync<T>(sql, bindParams(params));
  }

  selectOne<T>(sql: string, params?: SqlParam[]): Promise<T | null> {
    return this.db.getFirstAsync<T>(sql, bindParams(params));
  }

  async run(sql: string, params?: SqlParam[]): Promise<{ changes: number }> {
    const result = await this.db.runAsync(sql, bindParams(params));
    return { changes: result.changes };
  }

  async batch(statements: readonly { sql: string; params?: SqlParam[] }[]): Promise<void> {
    await this.transaction(async (tx) => {
      for (const statement of statements) {
        await tx.run(statement.sql, statement.params);
      }
    });
  }

  async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    if (this.txState.current) {
      return fn(this.txState.current);
    }

    let result!: T;
    await this.db.withExclusiveTransactionAsync(async (txn) => {
      const txExecutor = makeExecutor(txn);
      this.txState.current = txExecutor;
      try {
        result = await fn(txExecutor);
      } finally {
        this.txState.current = null;
      }
    });
    return result;
  }
}

function makeExecutor(handle: ConnectionHandle): SqlExecutor {
  return {
    select: <T>(sql: string, params?: SqlParam[]) => handle.getAllAsync<T>(sql, bindParams(params)),
    selectOne: <T>(sql: string, params?: SqlParam[]) =>
      handle.getFirstAsync<T>(sql, bindParams(params)),
    run: async (sql: string, params?: SqlParam[]) => {
      const result = await handle.runAsync(sql, bindParams(params));
      return { changes: result.changes };
    },
    batch: async (statements: readonly { sql: string; params?: SqlParam[] }[]) => {
      for (const statement of statements) {
        await handle.runAsync(statement.sql, bindParams(statement.params));
      }
    },
  };
}
