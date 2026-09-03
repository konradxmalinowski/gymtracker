import { DIAGNOSTIC_TABLES, getDatabaseDiagnostics } from '@/database/diagnostics';
import { runMigrations } from '@/database/migrations';
import { createTestDatabase } from '@/database/node/createTestDatabase';
import { createNodeDatabase, NodeSqlExecutor } from '@/database/node/NodeSqlExecutor';
import { insertExercise } from './helpers/fixtures';

describe('getDatabaseDiagnostics (ADR-0014 part 2 dev DB health screen data)', () => {
  it('reports schema version 0 and no migrations before the migration runner has run', async () => {
    // Schema applied directly (as createTestDatabase always does), but the
    // migration runner itself never ran, so user_version is still 0 and
    // migration_history has no rows - the state a truly fresh on-device install
    // is in for the instant between "database file created" and "runMigrations()
    // returns".
    const db = createTestDatabase();

    const diagnostics = await getDatabaseDiagnostics(db);
    expect(diagnostics.schemaVersion).toBe(0);
    expect(diagnostics.lastMigration).toBeNull();
  });

  it('reports full diagnostics after every migration runs', async () => {
    const raw = createNodeDatabase(':memory:');
    raw.exec('PRAGMA foreign_keys = ON');
    const db = new NodeSqlExecutor(raw);
    await runMigrations(db, '1.0.0-test');

    const diagnostics = await getDatabaseDiagnostics(db);

    // Was pinned to version 1 / 'initial_schema' before migration 002
    // (add_sleep_and_height_metrics) shipped - runMigrations() against an empty
    // database now applies both, landing at the latest known version.
    expect(diagnostics.schemaVersion).toBe(2);
    expect(diagnostics.lastMigration).toMatchObject({
      version: 2,
      name: 'add_sleep_and_height_metrics',
      appVersion: '1.0.0-test',
    });
    expect(diagnostics.integrityCheck).toBe('ok');
    expect(diagnostics.sqliteVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(diagnostics.compileOptions.length).toBeGreaterThan(0);
    expect(diagnostics.fts5Available).toBe(true);
    expect(diagnostics.partialIndexAvailable).toBe(true);
    expect(diagnostics.fileSizeBytes).toBeGreaterThan(0);

    expect(diagnostics.tableRowCounts).toHaveLength(DIAGNOSTIC_TABLES.length);
    // migration_history now carries two rows (001 and 002, both just ran); every
    // other table is still empty at this point.
    const nonMigrationTables = diagnostics.tableRowCounts.filter(
      (r) => r.table !== 'migration_history',
    );
    expect(nonMigrationTables.every((r) => r.rowCount === 0)).toBe(true);
    expect(diagnostics.tableRowCounts.find((r) => r.table === 'migration_history')?.rowCount).toBe(
      2,
    );
  });

  it('reflects row counts after data is inserted', async () => {
    const raw = createNodeDatabase(':memory:');
    raw.exec('PRAGMA foreign_keys = ON');
    const db = new NodeSqlExecutor(raw);
    await runMigrations(db, '1.0.0-test');
    await insertExercise(db);
    await insertExercise(db);

    const diagnostics = await getDatabaseDiagnostics(db);
    const exerciseCount = diagnostics.tableRowCounts.find((r) => r.table === 'exercise');
    expect(exerciseCount?.rowCount).toBe(2);
  });
});
