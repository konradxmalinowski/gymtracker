import type { SqlExecutor } from '@/repositories/contracts/database';
import type { Migration } from './types';

/**
 * Ships the four `daily_goal`/`daily_reminder` tables ARCHITECTURE.md section 7.12
 * has documented since the P17 planning pass but never created - the first genuinely
 * new set of tables since `001_initial.ts`, and (unlike migration 002's CHECK-widening
 * rebuild) a pure additive migration: every statement here is a plain `CREATE TABLE`/
 * `CREATE INDEX` against a name nothing in the database has used before, so there is
 * no existing-row backfill and no rebuild-and-rename dance to get right.
 *
 * Table shapes, FK `ON DELETE` choices, and index rationale are documented in full in
 * ARCHITECTURE.md section 7.12 - this migration's DDL is a verbatim copy of that
 * section's SQL block, and `database/schema.sql` (the canonical *current* cumulative
 * schema - see `SCHEMA_V1_SQL`'s own doc comment in `001_initial.ts`) has been updated
 * to match. This is `003`, not `002`: `002_add_sleep_and_height_metrics.ts` claimed
 * that number first, before this feature was ever implemented (see that file's own
 * history in CLAUDE.md's "Status" section).
 */
export const migration003DailyGoals: Migration = {
  version: 3,
  name: 'daily_goals',
  async up(tx: SqlExecutor): Promise<void> {
    await tx.run(`
      CREATE TABLE daily_goal (
          id              TEXT PRIMARY KEY,
          name            TEXT NOT NULL,
          icon            TEXT,
          goal_type       TEXT NOT NULL CHECK (goal_type IN ('boolean','counter','numeric')),
          target_value    REAL CHECK (target_value IS NULL OR target_value > 0),
          unit            TEXT,
          active_weekdays INTEGER NOT NULL CHECK (active_weekdays BETWEEN 1 AND 127),
          is_enabled      INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0,1)),
          sort_order      INTEGER NOT NULL DEFAULT 0,
          created_at      INTEGER NOT NULL,
          updated_at      INTEGER NOT NULL,
          deleted_at      INTEGER,
          CHECK (goal_type = 'boolean' OR target_value IS NOT NULL)
      )
    `);

    await tx.run(`
      CREATE TABLE daily_goal_entry (
          id             TEXT PRIMARY KEY,
          goal_id        TEXT NOT NULL REFERENCES daily_goal(id) ON DELETE CASCADE,
          local_date     TEXT NOT NULL,
          progress_value REAL NOT NULL DEFAULT 0,
          created_at     INTEGER NOT NULL,
          updated_at     INTEGER NOT NULL
      )
    `);
    await tx.run(
      'CREATE UNIQUE INDEX ux_daily_goal_entry_goal_date ON daily_goal_entry (goal_id, local_date)',
    );

    await tx.run(`
      CREATE TABLE daily_reminder (
          id               TEXT PRIMARY KEY,
          goal_id          TEXT REFERENCES daily_goal(id) ON DELETE SET NULL,
          name             TEXT NOT NULL,
          icon             TEXT,
          is_enabled       INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0,1)),
          reminder_type    TEXT NOT NULL CHECK (reminder_type IN ('scheduled','interval')),
          time_of_day      TEXT CHECK (time_of_day IS NULL OR time_of_day GLOB '[0-2][0-9]:[0-5][0-9]'),
          interval_minutes INTEGER CHECK (interval_minutes IS NULL OR interval_minutes >= 15),
          active_weekdays  INTEGER NOT NULL CHECK (active_weekdays BETWEEN 1 AND 127),
          created_at       INTEGER NOT NULL,
          updated_at       INTEGER NOT NULL,
          deleted_at       INTEGER,
          CHECK ((reminder_type = 'scheduled' AND time_of_day IS NOT NULL AND interval_minutes IS NULL)
              OR (reminder_type = 'interval' AND interval_minutes IS NOT NULL AND time_of_day IS NULL))
      )
    `);

    await tx.run(`
      CREATE TABLE daily_reminder_response (
          id           TEXT PRIMARY KEY,
          reminder_id  TEXT NOT NULL REFERENCES daily_reminder(id) ON DELETE CASCADE,
          local_date   TEXT NOT NULL,
          response     TEXT NOT NULL CHECK (response IN ('done','not_done')),
          responded_at INTEGER NOT NULL,
          created_at   INTEGER NOT NULL
      )
    `);
    await tx.run(
      'CREATE UNIQUE INDEX ux_daily_reminder_response_reminder_date ON daily_reminder_response (reminder_id, local_date)',
    );

    await tx.run(
      'CREATE INDEX ix_daily_goal_sort ON daily_goal (sort_order) WHERE deleted_at IS NULL',
    );
    await tx.run('CREATE INDEX ix_daily_goal_entry_date ON daily_goal_entry (local_date)');
    await tx.run(
      'CREATE INDEX ix_daily_reminder_goal ON daily_reminder (goal_id) WHERE deleted_at IS NULL',
    );
  },
};
