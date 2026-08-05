import type { DatabaseContext, SqlExecutor } from '@/repositories/contracts/database';
import { migration001Initial } from './001_initial';
import type { Migration } from './types';

export type { Migration } from './types';
export { migration001Initial, SCHEMA_V1_SQL } from './001_initial';

/** Every migration the app currently ships, in the order they were authored. */
export const MIGRATIONS: readonly Migration[] = [migration001Initial];

/** The highest schema version this build of the app knows how to run against. */
export const LATEST_KNOWN_VERSION: number = MIGRATIONS.reduce(
  (max, m) => Math.max(max, m.version),
  0,
);

export async function getSchemaVersion(db: SqlExecutor): Promise<number> {
  const row = await db.selectOne<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

export type ForwardVersionGuardResult =
  { ok: true } | { ok: false; databaseVersion: number; highestKnownVersion: number };

/**
 * ARCHITECTURE.md section 15.1: "the app refuses to run if PRAGMA user_version is
 * higher than the highest migration the bundle knows about ... showing a 'please
 * update the app' screen instead of corrupting data."
 *
 * This is the detection half of that rule. It never mutates the database. The
 * screen itself is a later frontend concern (out of this phase's owned files) -
 * callers should check this before doing anything else with the database and,
 * when `ok` is false, render the blocking screen instead of proceeding.
 */
export async function checkForwardVersionGuard(
  db: SqlExecutor,
): Promise<ForwardVersionGuardResult> {
  const databaseVersion = await getSchemaVersion(db);
  if (databaseVersion > LATEST_KNOWN_VERSION) {
    return { ok: false, databaseVersion, highestKnownVersion: LATEST_KNOWN_VERSION };
  }
  return { ok: true };
}

export type MigrationRunResult =
  | { status: 'up-to-date'; version: number }
  | { status: 'migrated'; from: number; to: number; applied: readonly Migration[] }
  | { status: 'unsupported-future-version'; databaseVersion: number; highestKnownVersion: number };

/**
 * Reads PRAGMA user_version, applies every migration with a higher version in
 * order, each inside its own transaction, then sets user_version - ARCHITECTURE.md
 * section 7.2. Refuses to touch the database at all if the forward-version guard
 * trips (section 15.1).
 *
 * `PRAGMA user_version = N` is set *inside* the same transaction as the migration's
 * own DDL and the `migration_history` insert (verified to participate correctly in
 * SQLite transactions/rollback), not as a separate statement afterwards - this is
 * what guarantees a migration that fails partway never leaves user_version bumped
 * past a migration that did not fully apply.
 */
export async function runMigrations(
  db: DatabaseContext,
  appVersion: string,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<MigrationRunResult> {
  const guard = await checkForwardVersionGuard(db);
  if (!guard.ok) {
    return {
      status: 'unsupported-future-version',
      databaseVersion: guard.databaseVersion,
      highestKnownVersion: guard.highestKnownVersion,
    };
  }

  const currentVersion = await getSchemaVersion(db);
  const pending = migrations
    .filter((m) => m.version > currentVersion)
    .slice()
    .sort((a, b) => a.version - b.version);

  if (pending.length === 0) {
    return { status: 'up-to-date', version: currentVersion };
  }

  const applied: Migration[] = [];
  for (const migration of pending) {
    if (!Number.isInteger(migration.version) || migration.version <= 0) {
      throw new Error(`Migration "${migration.name}" has an invalid version: ${migration.version}`);
    }
    await db.transaction(async (tx) => {
      await migration.up(tx);
      await tx.run(
        'INSERT INTO migration_history (version, name, applied_at, app_version) VALUES (?, ?, ?, ?)',
        [migration.version, migration.name, Date.now(), appVersion],
      );
      // PRAGMA statements do not accept bound parameters; migration.version is
      // validated as a positive integer immediately above, so interpolation here
      // carries no injection risk.
      await tx.run(`PRAGMA user_version = ${migration.version}`);
    });
    applied.push(migration);
  }

  const to = applied[applied.length - 1]?.version ?? currentVersion;
  return { status: 'migrated', from: currentVersion, to, applied };
}
