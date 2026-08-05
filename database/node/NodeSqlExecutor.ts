/// <reference types="node" />
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import type { DatabaseContext, SqlExecutor, SqlParam } from '@/repositories/contracts/database';

/**
 * `SqlExecutor`/`DatabaseContext` implementation over Node's built-in `node:sqlite`
 * - the Node counterpart of `database/client.ts`'s `ExpoSqlExecutor` (ARCHITECTURE.md
 * section 8.2 / ADR-0014 part 1). Used by the Jest test harness
 * (`createTestDatabase.ts`) and by `scripts/generate-perf-fixture.ts`; never by
 * app/feature code (which only ever depends on `expo-sqlite` via `database/client.ts`,
 * enforced by the `gymtracker/sqlite-boundary` ESLint rule).
 *
 * Why `node:sqlite` over `better-sqlite3` - see this phase's report for the full
 * reasoning; in short: zero native compilation (no node-gyp/prebuild step, nothing
 * to break in CI), ships with the exact Node version CI already pins (`24`), and
 * its synchronous API is otherwise a drop-in match for what `better-sqlite3` would
 * have offered here.
 */
export class NodeSqlExecutor implements DatabaseContext {
  private readonly statements = new Map<string, StatementSync>();
  private readonly txState: { current: SqlExecutor | null } = { current: null };

  constructor(private readonly db: DatabaseSync) {}

  private prepare(sql: string): StatementSync {
    let statement = this.statements.get(sql);
    if (!statement) {
      statement = this.db.prepare(sql);
      this.statements.set(sql, statement);
    }
    return statement;
  }

  // `async` here is load-bearing, not stylistic: node:sqlite is synchronous, so a
  // constraint violation (CHECK/UNIQUE/FOREIGN KEY) throws the moment the
  // statement runs. Without `async`, that throw would escape `select`/`run`
  // *synchronously*, before the caller ever gets a Promise back - breaking any
  // caller that does `expect(db.run(...)).rejects.toThrow()` or `.catch()`
  // without its own try/catch. `async` guarantees every SqlExecutor method
  // always returns (never throws), consistently turning a thrown error into a
  // rejected Promise, matching what ExpoSqlExecutor's genuinely-async methods do
  // for free.
  async select<T>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    return this.prepare(sql).all(...toNodeParams(params)) as T[];
  }

  async selectOne<T>(sql: string, params: SqlParam[] = []): Promise<T | null> {
    const row = this.prepare(sql).get(...toNodeParams(params));
    return (row ?? null) as T | null;
  }

  async run(sql: string, params: SqlParam[] = []): Promise<{ changes: number }> {
    const result = this.prepare(sql).run(...toNodeParams(params));
    return { changes: Number(result.changes) };
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

    this.db.exec('BEGIN');
    this.txState.current = this;
    try {
      const result = await fn(this);
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    } finally {
      this.txState.current = null;
    }
  }

  /** Finalizes cached prepared statements and closes the underlying connection. */
  close(): void {
    this.statements.clear();
    this.db.close();
  }
}

function toNodeParams(params: SqlParam[]): SqlParam[] {
  return params;
}

/**
 * `node:sqlite` is still marked experimental in Node 24 (functionally stable and
 * used only in Node-side tests/tooling here, never shipped to device) and prints a
 * one-time `ExperimentalWarning` on process start when the module is first
 * imported - before any application code runs, so it cannot be suppressed from
 * within this module. Harmless; ignore it in CI/test output.
 */
export function createNodeDatabase(location: string = ':memory:'): DatabaseSync {
  return new DatabaseSync(location);
}
