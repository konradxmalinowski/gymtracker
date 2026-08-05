import type { CatalogFile } from '@/database/seed/catalogSeeder';
import { seedCatalog } from '@/database/seed/catalogSeeder';
import { seedLookupTables } from '@/database/seed/lookupSeeder';
import { createTestDatabase } from '@/database/node/createTestDatabase';
import type { NodeSqlExecutor } from '@/database/node/NodeSqlExecutor';

const CATALOG_V1: CatalogFile = {
  catalogVersion: '2026.08.04-1',
  exercises: [
    {
      catalogSlug: 'barbell-bench-press',
      nameEn: 'Barbell Bench Press',
      nameSearch: 'barbell bench press',
      equipmentSlug: 'barbell',
      bodyPart: 'chest',
      muscles: [
        { slug: 'chest', role: 'primary' },
        { slug: 'triceps', role: 'secondary' },
      ],
      videos: [
        {
          url: 'https://example.com/bench',
          title: 'Bench Press Technique',
          channel: 'Example Channel',
        },
      ],
    },
    {
      catalogSlug: 'dumbbell-row',
      nameEn: 'Dumbbell Row',
      nameSearch: 'dumbbell row',
      equipmentSlug: 'dumbbell',
      bodyPart: 'back',
      muscles: [{ slug: 'lats', role: 'primary' }],
    },
  ],
};

const CATALOG_V2: CatalogFile = {
  catalogVersion: '2026.09.01-2',
  exercises: [
    {
      ...CATALOG_V1.exercises[0]!,
      nameEn: 'Barbell Bench Press (Updated)',
      muscles: [{ slug: 'chest', role: 'primary' }], // dropped the secondary triceps role
    },
    CATALOG_V1.exercises[1]!,
  ],
};

async function setUpDb(): Promise<NodeSqlExecutor> {
  const db = createTestDatabase();
  await seedLookupTables(db);
  return db;
}

describe('seedCatalog', () => {
  it('inserts every catalog exercise with source = catalog and records the version', async () => {
    const db = await setUpDb();
    const result = await seedCatalog(db, CATALOG_V1, { now: () => 1000, generateId: idSequence() });

    expect(result).toMatchObject({
      skipped: false,
      upsertedCount: 2,
      fromVersion: null,
      toVersion: CATALOG_V1.catalogVersion,
    });

    const rows = await db.select<{ catalog_slug: string; source: string }>(
      'SELECT catalog_slug, source FROM exercise ORDER BY catalog_slug',
    );
    expect(rows).toEqual([
      { catalog_slug: 'barbell-bench-press', source: 'catalog' },
      { catalog_slug: 'dumbbell-row', source: 'catalog' },
    ]);

    const versionSetting = await db.selectOne<{ value: string }>(
      "SELECT value FROM app_setting WHERE key = 'catalog.version'",
    );
    expect(JSON.parse(versionSetting!.value)).toBe(CATALOG_V1.catalogVersion);
  });

  it('populates exercise_muscle and curated exercise_video rows', async () => {
    const db = await setUpDb();
    await seedCatalog(db, CATALOG_V1, { now: () => 1000, generateId: idSequence() });

    const exercise = await db.selectOne<{ id: string }>(
      'SELECT id FROM exercise WHERE catalog_slug = ?',
      ['barbell-bench-press'],
    );
    const muscles = await db.select<{ muscle_slug: string; role: string }>(
      'SELECT muscle_slug, role FROM exercise_muscle WHERE exercise_id = ? ORDER BY role',
      [exercise!.id],
    );
    expect(muscles).toEqual([
      { muscle_slug: 'chest', role: 'primary' },
      { muscle_slug: 'triceps', role: 'secondary' },
    ]);

    const videos = await db.select<{ title: string; source: string }>(
      'SELECT title, source FROM exercise_video WHERE exercise_id = ?',
      [exercise!.id],
    );
    expect(videos).toEqual([{ title: 'Bench Press Technique', source: 'curated' }]);
  });

  it('rebuilds the FTS index so seeded exercises are searchable', async () => {
    const db = await setUpDb();
    await seedCatalog(db, CATALOG_V1, { now: () => 1000, generateId: idSequence() });

    const rows = await db.select(
      `SELECT e.catalog_slug FROM exercise e JOIN exercise_fts f ON f.rowid = e.rowid WHERE exercise_fts MATCH ?`,
      ['bench'],
    );
    expect(rows).toEqual([{ catalog_slug: 'barbell-bench-press' }]);
  });

  it('is a true no-op when the bundled version matches the stored version: zero writes, not just no visible change', async () => {
    const db = await setUpDb();
    await seedCatalog(db, CATALOG_V1, { now: () => 1000, generateId: idSequence() });

    const runSpy = jest.spyOn(db, 'run');
    const transactionSpy = jest.spyOn(db, 'transaction');
    const batchSpy = jest.spyOn(db, 'batch');

    const result = await seedCatalog(db, CATALOG_V1, { now: () => 2000, generateId: idSequence() });

    expect(result).toMatchObject({ skipped: true, upsertedCount: 0 });
    expect(runSpy).not.toHaveBeenCalled();
    expect(transactionSpy).not.toHaveBeenCalled();
    expect(batchSpy).not.toHaveBeenCalled();

    runSpy.mockRestore();
    transactionSpy.mockRestore();
    batchSpy.mockRestore();
  });

  it('updates catalog rows on a version bump and leaves exercise_user_data completely untouched', async () => {
    const db = await setUpDb();
    await seedCatalog(db, CATALOG_V1, { now: () => 1000, generateId: idSequence() });

    const exercise = await db.selectOne<{ id: string; updated_at: number }>(
      'SELECT id, updated_at FROM exercise WHERE catalog_slug = ?',
      ['barbell-bench-press'],
    );

    // The user favorited and annotated this exercise before the catalog refresh.
    await db.run(
      `INSERT INTO exercise_user_data (exercise_id, is_favorite, favorited_at, note, created_at, updated_at)
       VALUES (?, 1, 500, 'my personal note', 500, 500)`,
      [exercise!.id],
    );

    const result = await seedCatalog(db, CATALOG_V2, { now: () => 9000, generateId: idSequence() });
    expect(result).toMatchObject({
      skipped: false,
      upsertedCount: 2,
      fromVersion: CATALOG_V1.catalogVersion,
      toVersion: CATALOG_V2.catalogVersion,
    });

    const updatedExercise = await db.selectOne<{ id: string; name_en: string; updated_at: number }>(
      'SELECT id, name_en, updated_at FROM exercise WHERE catalog_slug = ?',
      ['barbell-bench-press'],
    );
    // Same row (id preserved across the refresh), new content.
    expect(updatedExercise?.id).toBe(exercise!.id);
    expect(updatedExercise?.name_en).toBe('Barbell Bench Press (Updated)');
    expect(updatedExercise?.updated_at).toBe(9000);

    // exercise_muscle was replaced to match the new entry (secondary triceps role dropped).
    const muscles = await db.select(
      'SELECT muscle_slug, role FROM exercise_muscle WHERE exercise_id = ?',
      [exercise!.id],
    );
    expect(muscles).toEqual([{ muscle_slug: 'chest', role: 'primary' }]);

    // exercise_user_data is byte-for-byte untouched.
    const userData = await db.selectOne('SELECT * FROM exercise_user_data WHERE exercise_id = ?', [
      exercise!.id,
    ]);
    expect(userData).toMatchObject({
      is_favorite: 1,
      favorited_at: 500,
      note: 'my personal note',
      updated_at: 500,
    });
  });

  it('never deletes a user-added (source = user) video when replacing curated videos', async () => {
    const db = await setUpDb();
    await seedCatalog(db, CATALOG_V1, { now: () => 1000, generateId: idSequence() });
    const exercise = await db.selectOne<{ id: string }>(
      'SELECT id FROM exercise WHERE catalog_slug = ?',
      ['barbell-bench-press'],
    );
    await db.run(
      `INSERT INTO exercise_video (id, exercise_id, url, title, source, created_at, updated_at)
       VALUES ('user-video-1', ?, 'https://example.com/my-video', 'My Own Clip', 'user', 100, 100)`,
      [exercise!.id],
    );

    await seedCatalog(db, CATALOG_V2, { now: () => 9000, generateId: idSequence() });

    const userVideo = await db.selectOne('SELECT * FROM exercise_video WHERE id = ?', [
      'user-video-1',
    ]);
    expect(userVideo).not.toBeNull();
  });

  it('touches only source = catalog rows, never inserting into exercise_user_data', async () => {
    const db = await setUpDb();
    await seedCatalog(db, CATALOG_V1, { now: () => 1000, generateId: idSequence() });
    const rows = await db.select('SELECT * FROM exercise_user_data');
    expect(rows).toHaveLength(0);
  });
});

function idSequence(): () => string {
  let n = 0;
  return () => `generated-id-${(n += 1)}`;
}
