import { createTestDatabase } from '@/database/node/createTestDatabase';
import type { NodeSqlExecutor } from '@/database/node/NodeSqlExecutor';
import { insertExercise } from './helpers/fixtures';

/**
 * Direct tests of the `exercise_fts` virtual table's own indexing/matching
 * behavior (not the catalog seeder's use of it - see catalogSeeder.test.ts for
 * that). Confirms FTS5, the contentless `'delete-all'` command and the
 * `remove_diacritics 2` tokenizer all behave as ARCHITECTURE.md section 7.4
 * documents.
 */
describe('exercise_fts (FTS5 virtual table)', () => {
  let db: NodeSqlExecutor;

  beforeEach(() => {
    db = createTestDatabase();
  });

  async function indexExercise(nameEn: string, namePl: string | null = null): Promise<string> {
    const id = await insertExercise(db, { nameEn });
    await db.run(
      `INSERT INTO exercise_fts (rowid, name_en, name_pl, aliases, equipment_slug, muscles)
       SELECT rowid, name_en, ?, '[]', NULL, '' FROM exercise WHERE id = ?`,
      [namePl, id],
    );
    return id;
  }

  it('matches on name_en via MATCH, joined back to the exercise row by rowid', async () => {
    const id = await indexExercise('Barbell Bench Press');
    await indexExercise('Dumbbell Row');

    const rows = await db.select<{ id: string }>(
      `SELECT e.id FROM exercise e JOIN exercise_fts f ON f.rowid = e.rowid WHERE exercise_fts MATCH ?`,
      ['bench'],
    );
    expect(rows).toEqual([{ id }]);
  });

  it('folds diacritics per the unicode61 remove_diacritics 2 tokenizer', async () => {
    const id = await indexExercise('Bench Press', 'Wyciskanie sztangi leżąc');

    const rows = await db.select<{ id: string }>(
      `SELECT e.id FROM exercise e JOIN exercise_fts f ON f.rowid = e.rowid WHERE exercise_fts MATCH ?`,
      ['lezac'],
    );
    expect(rows).toEqual([{ id }]);
  });

  it("clears the whole index via the contentless 'delete-all' command", async () => {
    await indexExercise('Barbell Squat');
    await db.run("INSERT INTO exercise_fts(exercise_fts) VALUES('delete-all')");

    const rows = await db.select('SELECT * FROM exercise_fts WHERE exercise_fts MATCH ?', [
      'squat',
    ]);
    expect(rows).toHaveLength(0);
  });

  it('matches on the denormalized space-joined muscles column', async () => {
    const id = await insertExercise(db, { nameEn: 'Some Row Variant' });
    await db.run(
      `INSERT INTO exercise_fts (rowid, name_en, name_pl, aliases, equipment_slug, muscles)
       SELECT rowid, name_en, NULL, '[]', NULL, 'lats biceps' FROM exercise WHERE id = ?`,
      [id],
    );

    const rows = await db.select('SELECT rowid FROM exercise_fts WHERE exercise_fts MATCH ?', [
      'lats',
    ]);
    expect(rows).toHaveLength(1);
  });
});
