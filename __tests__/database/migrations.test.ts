import {
  checkForwardVersionGuard,
  getSchemaVersion,
  LATEST_KNOWN_VERSION,
  MIGRATIONS,
  runMigrations,
} from '@/database/migrations';
import { createNodeDatabase, NodeSqlExecutor } from '@/database/node/NodeSqlExecutor';
import { createTestDatabase } from '@/database/node/createTestDatabase';

function createEmptyDatabase(): NodeSqlExecutor {
  const raw = createNodeDatabase(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  return new NodeSqlExecutor(raw);
}

async function tableSet(db: NodeSqlExecutor): Promise<Set<string>> {
  const rows = await db.select<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type IN ('table','view','index') AND name NOT LIKE 'sqlite_%'",
  );
  return new Set(rows.map((r) => r.name));
}

describe('migration runner', () => {
  it('applies migration 001 to an empty database, producing the same schema as schema.sql', async () => {
    const migrated = createEmptyDatabase();
    const result = await runMigrations(migrated, '1.0.0-test');
    expect(result.status).toBe('migrated');

    const direct = createTestDatabase();

    expect(await tableSet(migrated)).toEqual(await tableSet(direct));
  });

  it('starts at schema version 0 on a fresh database', async () => {
    const db = createEmptyDatabase();
    expect(await getSchemaVersion(db)).toBe(0);
  });

  it('sets PRAGMA user_version to the latest migration version after running', async () => {
    const db = createEmptyDatabase();
    await runMigrations(db, '1.0.0-test');
    expect(await getSchemaVersion(db)).toBe(LATEST_KNOWN_VERSION);
  });

  it('records every applied migration in migration_history', async () => {
    const db = createEmptyDatabase();
    await runMigrations(db, '1.0.0-test');
    const rows = await db.select<{ version: number; name: string; app_version: string }>(
      'SELECT version, name, app_version FROM migration_history ORDER BY version',
    );
    expect(rows).toEqual(
      MIGRATIONS.map((m) => ({ version: m.version, name: m.name, app_version: '1.0.0-test' })),
    );
  });

  it('is a no-op when already up to date', async () => {
    const db = createEmptyDatabase();
    await runMigrations(db, '1.0.0-test');

    const runSpy = jest.spyOn(db, 'run');
    const result = await runMigrations(db, '1.0.0-test');

    expect(result).toEqual({ status: 'up-to-date', version: LATEST_KNOWN_VERSION });
    expect(runSpy).not.toHaveBeenCalled();
    runSpy.mockRestore();
  });

  it('applies only migrations newer than the current version, in order', async () => {
    const db = createEmptyDatabase();
    const applyOrder: number[] = [];
    const migrations = [
      {
        version: 1,
        name: 'creates_marker_table',
        up: async (tx: NodeSqlExecutor) => {
          applyOrder.push(1);
          // The runner itself writes to migration_history, which normally comes
          // from the real migration 001 (schema.sql); these fake migrations stand
          // in for it entirely, so they must create it too.
          await tx.run(
            'CREATE TABLE migration_history (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL, app_version TEXT NOT NULL)',
          );
          await tx.run('CREATE TABLE marker (id INTEGER PRIMARY KEY)');
        },
      },
      {
        version: 2,
        name: 'adds_marker_column',
        up: async (tx: NodeSqlExecutor) => {
          applyOrder.push(2);
          await tx.run('ALTER TABLE marker ADD COLUMN note TEXT');
        },
      },
    ];

    const firstRun = await runMigrations(db, '1.0.0-test', migrations);
    expect(firstRun).toMatchObject({ status: 'migrated', from: 0, to: 2 });
    expect(applyOrder).toEqual([1, 2]);
    expect(await getSchemaVersion(db)).toBe(2);

    // A database already at version 1 (e.g. an app upgrade) only applies version 2.
    const upgrading = createEmptyDatabase();
    await runMigrations(upgrading, '1.0.0-test', [migrations[0]!]);
    applyOrder.length = 0;
    const secondRun = await runMigrations(upgrading, '1.0.0-test', migrations);
    expect(secondRun).toMatchObject({ status: 'migrated', from: 1, to: 2 });
    expect(applyOrder).toEqual([2]);
  });

  it('refuses to run when the database schema version is newer than any known migration', async () => {
    const db = createEmptyDatabase();
    await runMigrations(db, '1.0.0-test');
    await db.run(`PRAGMA user_version = ${LATEST_KNOWN_VERSION + 5}`);

    const guard = await checkForwardVersionGuard(db);
    expect(guard).toEqual({
      ok: false,
      databaseVersion: LATEST_KNOWN_VERSION + 5,
      highestKnownVersion: LATEST_KNOWN_VERSION,
    });

    const runSpy = jest.spyOn(db, 'run');
    const result = await runMigrations(db, '1.0.0-test');
    expect(result).toEqual({
      status: 'unsupported-future-version',
      databaseVersion: LATEST_KNOWN_VERSION + 5,
      highestKnownVersion: LATEST_KNOWN_VERSION,
    });
    expect(runSpy).not.toHaveBeenCalled();
    runSpy.mockRestore();
  });

  it('rolls back the whole migration (including user_version) if it fails partway', async () => {
    const db = createEmptyDatabase();
    const failingMigration = {
      version: 1,
      name: 'broken',
      up: async (tx: NodeSqlExecutor) => {
        await tx.run('CREATE TABLE ok_so_far (id TEXT PRIMARY KEY)');
        await tx.run('THIS IS NOT VALID SQL');
      },
    };

    await expect(runMigrations(db, '1.0.0-test', [failingMigration])).rejects.toThrow();

    expect(await getSchemaVersion(db)).toBe(0);
    const table = await db.selectOne<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ok_so_far'",
    );
    expect(table).toBeNull();
    const historyRows = await db.select(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'migration_history'",
    );
    // migration_history itself never got created because the whole transaction rolled back.
    expect(historyRows).toHaveLength(0);
  });
});
