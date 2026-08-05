import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSqlStatements } from '../migrations/parseSql';
import { createNodeDatabase, NodeSqlExecutor } from './NodeSqlExecutor';

const SCHEMA_PATH = join(__dirname, '..', 'schema.sql');

/**
 * Creates an in-memory SQLite database with `database/schema.sql` applied directly
 * (not through the migration runner - this is the fast path ADR-0014 part 1
 * describes: "Tests create an in-memory database, apply `database/schema.sql`, and
 * exercise the real SQL"). Every repository test in this and every future phase
 * should build its fixture through this function.
 *
 * `foreign_keys = ON` is set explicitly (mirroring the pragma `database/client.ts`
 * sets on every device connection) so FK/CASCADE behavior is exercised the same way
 * in Node as on device; the other four connection pragmas from ARCHITECTURE.md 7.1
 * (`journal_mode`, `synchronous`, `busy_timeout`, `temp_store`) govern durability
 * and concurrency, which have no meaningful equivalent on an in-process,
 * single-connection `:memory:` database, so they are not applied here.
 */
export function createTestDatabase(): NodeSqlExecutor {
  const db = createNodeDatabase(':memory:');
  db.exec('PRAGMA foreign_keys = ON');

  const schemaSql = readFileSync(SCHEMA_PATH, 'utf8');
  for (const statement of parseSqlStatements(schemaSql)) {
    db.exec(statement);
  }

  return new NodeSqlExecutor(db);
}
