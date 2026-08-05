import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCHEMA_V1_SQL } from '@/database/migrations/001_initial';
import { createTestDatabase } from '@/database/node/createTestDatabase';
import type { NodeSqlExecutor } from '@/database/node/NodeSqlExecutor';

const SCHEMA_SQL_PATH = join(__dirname, '..', '..', 'database', 'schema.sql');

describe('database/schema.sql', () => {
  it('is byte-for-byte identical to the DDL embedded in migration 001', () => {
    const fileContents = readFileSync(SCHEMA_SQL_PATH, 'utf8');
    expect(fileContents.trim()).toBe(SCHEMA_V1_SQL.trim());
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
