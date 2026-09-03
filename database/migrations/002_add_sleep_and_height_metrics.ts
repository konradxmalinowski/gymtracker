import type { SqlExecutor } from '@/repositories/contracts/database';
import type { Migration } from './types';

/**
 * Widens `body_metric_entry.metric`'s CHECK constraint to add `'sleep_hours'` and
 * `'height'` to the 15 values migration 001 shipped with - body-metrics phase scope.
 *
 * SQLite has no `ALTER TABLE ... ALTER COLUMN` for a CHECK constraint, so this is the
 * standard rebuild pattern: create a new table with the widened constraint, copy every
 * row across, drop the old table, rename the new one into place, then recreate the one
 * index that lived on it. `database/schema.sql` already reflects this post-migration
 * shape (it is the canonical *current* cumulative schema, not migration 001's frozen
 * snapshot - see `SCHEMA_V1_SQL`'s own doc comment in `001_initial.ts`), so this file's
 * DDL must stay in sync with `schema.sql`'s `body_metric_entry`/`ix_body_metric`
 * definitions rather than being authored independently.
 */
export const migration002AddSleepAndHeightMetrics: Migration = {
  version: 2,
  name: 'add_sleep_and_height_metrics',
  async up(tx: SqlExecutor): Promise<void> {
    await tx.run(`
      CREATE TABLE body_metric_entry_new (
          id          TEXT PRIMARY KEY,
          metric      TEXT NOT NULL CHECK (metric IN
                      ('body_weight','body_fat_pct','chest','waist','hips','neck','shoulders',
                       'arm_left','arm_right','forearm_left','forearm_right',
                       'thigh_left','thigh_right','calf_left','calf_right',
                       'sleep_hours','height')),
          value       REAL NOT NULL,       -- kg for body_weight, percent for body_fat_pct, hours for sleep_hours, cm otherwise
          measured_at INTEGER NOT NULL,
          local_date  TEXT NOT NULL,
          note        TEXT,
          created_at  INTEGER NOT NULL,
          updated_at  INTEGER NOT NULL,
          deleted_at  INTEGER
      )
    `);
    await tx.run(`
      INSERT INTO body_metric_entry_new
      SELECT id, metric, value, measured_at, local_date, note, created_at, updated_at, deleted_at
      FROM body_metric_entry
    `);
    await tx.run('DROP TABLE body_metric_entry');
    await tx.run('ALTER TABLE body_metric_entry_new RENAME TO body_metric_entry');
    await tx.run(
      'CREATE INDEX ix_body_metric ON body_metric_entry (metric, measured_at DESC) WHERE deleted_at IS NULL',
    );
  },
};
