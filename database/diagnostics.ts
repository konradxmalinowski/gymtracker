import type { SqlExecutor } from '@/repositories/contracts/database';
import { getSchemaVersion } from './migrations';

/**
 * Data/query layer for the dev-only database health screen - ADR-0014 part 2 ("What
 * exists regardless of that decision") and ARCHITECTURE.md section 16's
 * "Database health" row. No UI here (that is a later frontend-agent step, and
 * `app/**` is out of this phase's owned files) - this module exists so that
 * screen's job is a single function call.
 */

/** Every base table this schema version defines - ARCHITECTURE.md section 7.2-7.8. */
export const DIAGNOSTIC_TABLES: readonly string[] = [
  'migration_history',
  'user_profile',
  'app_setting',
  'muscle',
  'equipment',
  'exercise',
  'exercise_user_data',
  'exercise_muscle',
  'exercise_video',
  'exercise_fts',
  'plan',
  'plan_day',
  'plan_day_exercise',
  'workout_session',
  'session_exercise',
  'workout_set',
  'active_session_state',
  'personal_record',
  'body_metric_entry',
  'progress_photo',
];

export interface TableRowCount {
  table: string;
  rowCount: number;
}

export interface LastMigration {
  version: number;
  name: string;
  appliedAt: number;
  appVersion: string;
}

export interface DatabaseDiagnostics {
  schemaVersion: number;
  lastMigration: LastMigration | null;
  tableRowCounts: TableRowCount[];
  fileSizeBytes: number;
  integrityCheck: string;
  sqliteVersion: string;
  compileOptions: string[];
  fts5Available: boolean;
  partialIndexAvailable: boolean;
}

export async function getDatabaseDiagnostics(db: SqlExecutor): Promise<DatabaseDiagnostics> {
  const [
    schemaVersion,
    lastMigration,
    tableRowCounts,
    fileSizeBytes,
    integrityCheck,
    sqliteVersion,
    compileOptions,
  ] = await Promise.all([
    getSchemaVersion(db),
    getLastMigration(db),
    getTableRowCounts(db),
    getFileSizeBytes(db),
    getIntegrityCheck(db),
    getSqliteVersion(db),
    getCompileOptions(db),
  ]);

  return {
    schemaVersion,
    lastMigration,
    tableRowCounts,
    fileSizeBytes,
    integrityCheck,
    sqliteVersion,
    compileOptions,
    fts5Available: await isFts5Available(db),
    partialIndexAvailable: await isPartialIndexAvailable(db),
  };
}

async function getLastMigration(db: SqlExecutor): Promise<LastMigration | null> {
  const row = await db.selectOne<{
    version: number;
    name: string;
    applied_at: number;
    app_version: string;
  }>(
    'SELECT version, name, applied_at, app_version FROM migration_history ORDER BY version DESC LIMIT 1',
  );
  if (!row) return null;
  return {
    version: row.version,
    name: row.name,
    appliedAt: row.applied_at,
    appVersion: row.app_version,
  };
}

async function getTableRowCounts(db: SqlExecutor): Promise<TableRowCount[]> {
  const counts: TableRowCount[] = [];
  for (const table of DIAGNOSTIC_TABLES) {
    // Table names come only from the fixed DIAGNOSTIC_TABLES constant above, never
    // from user input, so string interpolation here carries no injection risk (a
    // table/view name cannot be a bound parameter in SQLite).
    const row = await db.selectOne<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`);
    counts.push({ table, rowCount: row?.count ?? 0 });
  }
  return counts;
}

async function getFileSizeBytes(db: SqlExecutor): Promise<number> {
  const [pageCount, pageSize] = await Promise.all([
    db.selectOne<{ page_count: number }>('PRAGMA page_count'),
    db.selectOne<{ page_size: number }>('PRAGMA page_size'),
  ]);
  return (pageCount?.page_count ?? 0) * (pageSize?.page_size ?? 0);
}

async function getIntegrityCheck(db: SqlExecutor): Promise<string> {
  const rows = await db.select<{ integrity_check: string }>('PRAGMA integrity_check');
  const messages = rows.map((r) => r.integrity_check);
  if (messages.length === 1 && messages[0] === 'ok') return 'ok';
  return messages.join('; ');
}

async function getSqliteVersion(db: SqlExecutor): Promise<string> {
  const row = await db.selectOne<{ version: string }>('SELECT sqlite_version() AS version');
  return row?.version ?? 'unknown';
}

async function getCompileOptions(db: SqlExecutor): Promise<string[]> {
  const rows = await db.select<{ compile_options: string }>('PRAGMA compile_options');
  return rows.map((r) => r.compile_options);
}

/**
 * Rather than trusting `PRAGMA compile_options` to literally list `ENABLE_FTS5`
 * (build-dependent whether it appears), this checks for the real artifact: if
 * migration 001 ran, `exercise_fts` exists in `sqlite_master` only if `CREATE
 * VIRTUAL TABLE ... USING fts5(...)` succeeded. Presence is proof, directly
 * exercising ADR-0014's "assert the availability of FTS5" residual-risk mitigation.
 */
async function isFts5Available(db: SqlExecutor): Promise<boolean> {
  const row = await db.selectOne<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'exercise_fts'",
  );
  return row !== null;
}

/** Same reasoning as isFts5Available, using one of the three partial unique indexes. */
async function isPartialIndexAvailable(db: SqlExecutor): Promise<boolean> {
  const row = await db.selectOne<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'ux_plan_single_active'",
  );
  return row !== null;
}
