import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runMigrations } from '@/database/migrations';
import { createTestDatabase } from '@/database/node/createTestDatabase';
import { createNodeDatabase, NodeSqlExecutor } from '@/database/node/NodeSqlExecutor';

const SCHEMA_SQL_PATH = join(__dirname, '..', '..', 'database', 'schema.sql');

describe('database/schema.sql', () => {
  // Pre-migration-002, this test compared schema.sql byte-for-byte against
  // SCHEMA_V1_SQL (migration 001's embedded DDL) - true only because no migration had
  // ever shipped past version 1. schema.sql is now the canonical *current* cumulative
  // schema (it's what database/node/createTestDatabase.ts applies directly, and every
  // repository test in the app builds its fixture from it), while SCHEMA_V1_SQL stays
  // a deliberately frozen historical snapshot of what migration 001 alone produces -
  // see that constant's own doc comment in 001_initial.ts. The real invariant worth
  // guarding is that the two paths to "a fully migrated database" - applying
  // schema.sql directly, versus running every migration (001, 002, ...) against an
  // empty database - still accept and reject exactly the same body_metric_entry.metric
  // values, so this test now runs the full migration chain and probes both databases'
  // CHECK constraints with real inserts, rather than comparing raw DDL text (SQLite's
  // own DROP+RENAME rebuild in migration 002 re-quotes the table name and re-formats
  // whitespace, so the *text* of the two paths' sqlite_master.sql legitimately
  // diverges even though their accepted-value sets are identical).
  it('running every migration against an empty database accepts/rejects the same body_metric_entry.metric values as schema.sql', async () => {
    const raw = createNodeDatabase(':memory:');
    raw.exec('PRAGMA foreign_keys = ON');
    const migrated = new NodeSqlExecutor(raw);
    await runMigrations(migrated, '1.0.0-test');

    const direct = createTestDatabase();

    const acceptedMetrics = [
      'body_weight',
      'body_fat_pct',
      'chest',
      'waist',
      'hips',
      'neck',
      'shoulders',
      'arm_left',
      'arm_right',
      'forearm_left',
      'forearm_right',
      'thigh_left',
      'thigh_right',
      'calf_left',
      'calf_right',
      'sleep_hours',
      'height',
    ];

    const insertSql = `INSERT INTO body_metric_entry
      (id, metric, value, measured_at, local_date, created_at, updated_at)
      VALUES (?, ?, 1, 0, '2026-01-01', 0, 0)`;

    for (const db of [migrated, direct]) {
      for (const metric of acceptedMetrics) {
        await db.run(insertSql, [`${metric}-id`, metric]);
      }
      await expect(db.run(insertSql, ['bad-id', 'not_a_real_metric'])).rejects.toThrow();
    }
  });

  it("schema.sql's body_metric_entry CHECK constraint covers all 17 current metric values", () => {
    const fileContents = readFileSync(SCHEMA_SQL_PATH, 'utf8');
    const expectedMetrics = [
      'body_weight',
      'body_fat_pct',
      'chest',
      'waist',
      'hips',
      'neck',
      'shoulders',
      'arm_left',
      'arm_right',
      'forearm_left',
      'forearm_right',
      'thigh_left',
      'thigh_right',
      'calf_left',
      'calf_right',
      'sleep_hours',
      'height',
    ];
    for (const metric of expectedMetrics) {
      expect(fileContents).toContain(`'${metric}'`);
    }
  });

  describe('applied to a fresh database', () => {
    let db: NodeSqlExecutor;

    beforeAll(() => {
      db = createTestDatabase();
    });

    const expectedTables = [
      'migration_history',
      'user_profile',
      'app_setting',
      'muscle',
      'equipment',
      'exercise',
      'exercise_user_data',
      'exercise_muscle',
      'exercise_video',
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

    it.each(expectedTables)('creates table %s', async (table) => {
      const row = await db.selectOne<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        [table],
      );
      expect(row?.name).toBe(table);
    });

    it('creates the exercise_fts virtual table', async () => {
      const row = await db.selectOne<{ name: string; sql: string }>(
        "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name = 'exercise_fts'",
      );
      expect(row?.name).toBe('exercise_fts');
      expect(row?.sql).toContain('fts5');
    });

    const expectedIndexes = [
      'ux_plan_single_active',
      'ux_session_single_in_progress',
      'ux_pr_current',
      'ix_set_exercise_time',
      'ix_set_session',
      'ix_set_session_exercise',
      'ix_set_parent',
      'ix_session_local_date',
      'ix_session_started',
      'ix_session_plan_day',
      'ix_session_exercise_sess',
      'ix_session_exercise_ex',
      'ix_exercise_equipment',
      'ix_exercise_name',
      'ix_exercise_source',
      'ix_exercise_muscle_rev',
      'ix_exercise_fav',
      'ix_video_exercise',
      'ix_plan_day_plan',
      'ix_pde_day',
      'ix_pde_exercise',
      'ix_pr_exercise',
      'ix_pr_recent',
      'ix_body_metric',
      'ix_photo_taken',
    ];

    it.each(expectedIndexes)('creates index %s', async (index) => {
      const row = await db.selectOne<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?",
        [index],
      );
      expect(row?.name).toBe(index);
    });

    const expectedViews = ['v_working_set', 'v_session_summary', 'v_exercise_last_session'];

    it.each(expectedViews)('creates view %s', async (view) => {
      const row = await db.selectOne<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'view' AND name = ?",
        [view],
      );
      expect(row?.name).toBe(view);
    });

    it('creates exercise_muscle as a WITHOUT ROWID table', async () => {
      const row = await db.selectOne<{ sql: string }>(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'exercise_muscle'",
      );
      expect(row?.sql).toMatch(/WITHOUT ROWID/i);
    });
  });
});
