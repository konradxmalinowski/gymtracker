import { createTestDatabase } from '@/database/node/createTestDatabase';
import { seedLookupTables } from '@/database/seed/lookupSeeder';
import { ExerciseNotEditableError } from '@/features/exercise-library/repository/errors';
import { SqliteExerciseRepository } from '@/features/exercise-library/repository/SqliteExerciseRepository';
import { RepositoryNotFoundError } from '@/repositories/base';
import type { DatabaseContext } from '@/repositories/contracts/database';
import { FixedClock } from '@/services/clock';
import { Uuid7IdGenerator } from '@/services/id';

async function setup() {
  const db = createTestDatabase();
  await seedLookupTables(db);
  const clock = new FixedClock(Date.UTC(2026, 0, 1, 12));
  const idGenerator = new Uuid7IdGenerator(clock);
  const repo = new SqliteExerciseRepository({ db, clock, idGenerator });
  return { db, clock, repo };
}

/** Inserts a catalog-source exercise directly (bypassing `createCustom`, which only ever writes `source = 'custom'` rows) - mirrors what `replaceCatalog`/`seedCatalog` produces. */
async function insertCatalogExercise(
  db: DatabaseContext,
  overrides: Partial<{
    id: string;
    catalogSlug: string;
    nameEn: string;
    namePl: string | null;
    equipmentSlug: string | null;
    bodyPart: string | null;
    level: 'beginner' | 'intermediate' | 'expert' | null;
  }> = {},
): Promise<string> {
  const id = overrides.id ?? `catalog-${Math.random().toString(36).slice(2)}`;
  const nameEn = overrides.nameEn ?? 'Catalog Exercise';
  const now = Date.now();
  await db.run(
    `INSERT INTO exercise (
       id, source, catalog_slug, name_en, name_pl, name_search, aliases, equipment_slug, body_part, level,
       tracking_type, instructions, images, created_at, updated_at
     ) VALUES (?, 'catalog', ?, ?, ?, ?, '[]', ?, ?, ?, 'weight_reps', '[]', '[]', ?, ?)`,
    [
      id,
      overrides.catalogSlug ?? id,
      nameEn,
      overrides.namePl ?? null,
      nameEn.toLowerCase(),
      overrides.equipmentSlug ?? null,
      overrides.bodyPart ?? null,
      overrides.level ?? null,
      now,
      now,
    ],
  );
  return id;
}

describe('SqliteExerciseRepository.search() - text search', () => {
  it('finds a diacritic-bearing Polish name via a plain-ASCII query (ADR-0003 acceptance criterion)', async () => {
    const { repo } = await setup();
    await repo.createCustom({
      nameEn: 'Barbell Bench Press',
      namePl: 'Wyciskanie sztangi leżąc',
      equipmentSlug: 'barbell',
      muscles: [{ slug: 'chest', role: 'primary' }],
    });

    const results = await repo.search({ text: 'lezac' });

    expect(results).toHaveLength(1);
    expect(results[0]!.namePl).toBe('Wyciskanie sztangi leżąc');
  });

  it('ranks an exact prefix match first', async () => {
    const { repo } = await setup();
    await repo.createCustom({
      nameEn: 'Dumbbell Bench Fly',
      muscles: [{ slug: 'chest', role: 'primary' }],
    });
    await repo.createCustom({
      nameEn: 'Bench Press',
      muscles: [{ slug: 'chest', role: 'primary' }],
    });

    const results = await repo.search({ text: 'bench' });

    expect(results.map((r) => r.nameEn)).toEqual(['Bench Press', 'Dumbbell Bench Fly']);
  });

  it('a newly created custom exercise is searchable immediately (ROADMAP.md P4 acceptance criterion)', async () => {
    const { repo } = await setup();
    const created = await repo.createCustom({
      nameEn: 'My Brand New Exercise',
      muscles: [{ slug: 'chest', role: 'primary' }],
    });

    const results = await repo.search({ text: 'brand new' });

    expect(results.map((r) => r.id)).toContain(created.id);
  });

  it('an update that changes the name is searchable under the new name and not the old one', async () => {
    const { repo } = await setup();
    const created = await repo.createCustom({
      nameEn: 'Old Exercise Name',
      muscles: [{ slug: 'chest', role: 'primary' }],
    });

    await repo.updateCustom(created.id, { nameEn: 'Renamed Exercise' });

    expect((await repo.search({ text: 'renamed' })).map((r) => r.id)).toContain(created.id);
    expect((await repo.search({ text: 'old exercise' })).map((r) => r.id)).not.toContain(
      created.id,
    );
  });

  it('a soft-deleted exercise no longer appears in search results', async () => {
    const { repo } = await setup();
    const created = await repo.createCustom({
      nameEn: 'Exercise To Delete',
      muscles: [{ slug: 'chest', role: 'primary' }],
    });

    await repo.deleteCustom(created.id);

    expect((await repo.search({ text: 'exercise to delete' })).map((r) => r.id)).not.toContain(
      created.id,
    );
  });
});

describe('SqliteExerciseRepository.search() - empty query fallback (ADR-0003)', () => {
  it('returns a plain filtered, alphabetically-ordered list when text is omitted', async () => {
    const { repo } = await setup();
    await repo.createCustom({ nameEn: 'Zebra Curl', muscles: [] });
    await repo.createCustom({ nameEn: 'Apple Press', muscles: [] });

    const results = await repo.search({});

    const names = results.map((r) => r.nameEn);
    expect(names.indexOf('Apple Press')).toBeLessThan(names.indexOf('Zebra Curl'));
  });

  it('returns a plain filtered list when text is whitespace-only', async () => {
    const { repo } = await setup();
    await repo.createCustom({ nameEn: 'Whitespace Query Exercise', muscles: [] });

    const results = await repo.search({ text: '   ' });

    expect(results.map((r) => r.nameEn)).toContain('Whitespace Query Exercise');
  });
});

describe('SqliteExerciseRepository.search() - filter composition', () => {
  it('composes muscle OR muscle, AND equipment (confirmed multi-select semantics)', async () => {
    const { repo } = await setup();
    const chestBarbell = await repo.createCustom({
      nameEn: 'Chest Barbell',
      equipmentSlug: 'barbell',
      muscles: [{ slug: 'chest', role: 'primary' }],
    });
    const backBarbell = await repo.createCustom({
      nameEn: 'Back Barbell',
      equipmentSlug: 'barbell',
      muscles: [{ slug: 'lats', role: 'primary' }],
    });
    const chestDumbbell = await repo.createCustom({
      nameEn: 'Chest Dumbbell',
      equipmentSlug: 'dumbbell',
      muscles: [{ slug: 'chest', role: 'primary' }],
    });
    const shouldersBarbell = await repo.createCustom({
      nameEn: 'Shoulders Barbell',
      equipmentSlug: 'barbell',
      muscles: [{ slug: 'shoulders', role: 'primary' }],
    });

    const results = await repo.search({
      muscleSlugs: ['chest', 'shoulders'],
      equipmentSlugs: ['barbell'],
    });
    const ids = results.map((r) => r.id);

    expect(ids).toEqual(expect.arrayContaining([chestBarbell.id, shouldersBarbell.id]));
    expect(ids).not.toContain(backBarbell.id);
    expect(ids).not.toContain(chestDumbbell.id);
  });

  it('filters by level', async () => {
    const { repo } = await setup();
    const beginner = await repo.createCustom({
      nameEn: 'Beginner Move',
      level: 'beginner',
      muscles: [],
    });
    await repo.createCustom({ nameEn: 'Expert Move', level: 'expert', muscles: [] });

    const results = await repo.search({ level: 'beginner' });

    expect(results.map((r) => r.id)).toEqual([beginner.id]);
  });

  it('filters by bodyParts', async () => {
    const { repo } = await setup();
    const core = await repo.createCustom({ nameEn: 'Core Move', bodyPart: 'core', muscles: [] });
    await repo.createCustom({ nameEn: 'Leg Move', bodyPart: 'legs', muscles: [] });

    const results = await repo.search({ bodyParts: ['core'] });

    expect(results.map((r) => r.id)).toEqual([core.id]);
  });

  it('filters by source', async () => {
    const { db, repo } = await setup();
    const custom = await repo.createCustom({ nameEn: 'Custom One', muscles: [] });
    await insertCatalogExercise(db, { nameEn: 'Catalog One' });

    const results = await repo.search({ source: 'custom' });

    expect(results.map((r) => r.id)).toEqual([custom.id]);
  });

  it('filters by context: gym excludes home-only-style equipment absent from is_gym, home excludes gym-only equipment', async () => {
    const { repo } = await setup();
    // 'barbell' is gym-only (isHome: false); 'body only' is both gym and home.
    const gymOnly = await repo.createCustom({
      nameEn: 'Gym Only Move',
      equipmentSlug: 'barbell',
      muscles: [],
    });
    const bothContexts = await repo.createCustom({
      nameEn: 'Both Context Move',
      equipmentSlug: 'body only',
      muscles: [],
    });

    const homeResults = await repo.search({ context: 'home' });
    const homeIds = homeResults.map((r) => r.id);
    expect(homeIds).toContain(bothContexts.id);
    expect(homeIds).not.toContain(gymOnly.id);

    const gymResults = await repo.search({ context: 'gym' });
    const gymIds = gymResults.map((r) => r.id);
    expect(gymIds).toEqual(expect.arrayContaining([gymOnly.id, bothContexts.id]));
  });
});

describe('SqliteExerciseRepository.search() - favorites-first ordering', () => {
  it('places a favorited exercise ahead of a non-favorited one regardless of name order', async () => {
    const { repo } = await setup();
    const aardvark = await repo.createCustom({ nameEn: 'Aardvark Curl', muscles: [] });
    const zebra = await repo.createCustom({ nameEn: 'Zebra Curl', muscles: [] });
    await repo.setFavorite(zebra.id, true);

    const results = await repo.search({});

    expect(results[0]!.id).toBe(zebra.id);
    expect(results.map((r) => r.id)).toContain(aardvark.id);
  });

  it('favorites-first ordering also applies to a text search', async () => {
    const { repo } = await setup();
    const nonFavorite = await repo.createCustom({ nameEn: 'Bench Variant A', muscles: [] });
    const favorite = await repo.createCustom({ nameEn: 'Bench Variant B', muscles: [] });
    await repo.setFavorite(favorite.id, true);

    const results = await repo.search({ text: 'bench' });

    expect(results[0]!.id).toBe(favorite.id);
    expect(results.map((r) => r.id)).toContain(nonFavorite.id);
  });

  it('favoritesOnly excludes non-favorited exercises', async () => {
    const { repo } = await setup();
    const favorite = await repo.createCustom({ nameEn: 'Favorite Move', muscles: [] });
    await repo.createCustom({ nameEn: 'Regular Move', muscles: [] });
    await repo.setFavorite(favorite.id, true);

    const results = await repo.search({ favoritesOnly: true });

    expect(results.map((r) => r.id)).toEqual([favorite.id]);
  });
});

describe('SqliteExerciseRepository.findById()', () => {
  it('returns null for a missing id', async () => {
    const { repo } = await setup();
    expect(await repo.findById('does-not-exist')).toBeNull();
  });

  it('returns the full detail shape with muscles and default user data', async () => {
    const { repo } = await setup();
    const created = await repo.createCustom({
      nameEn: 'Detail Exercise',
      namePl: 'Cwiczenie',
      muscles: [
        { slug: 'chest', role: 'primary' },
        { slug: 'triceps', role: 'secondary' },
      ],
    });

    const found = await repo.findById(created.id);

    expect(found).not.toBeNull();
    expect(found!.muscles).toEqual(
      expect.arrayContaining([
        { slug: 'chest', role: 'primary' },
        { slug: 'triceps', role: 'secondary' },
      ]),
    );
    expect(found!.videos).toEqual([]);
    expect(found!.userData).toEqual({
      isFavorite: false,
      favoritedAt: null,
      note: null,
      defaultRestSeconds: null,
      displayNameOverride: null,
      lastPerformedAt: null,
    });
  });

  it('reflects favorite/note/rest-override writes', async () => {
    const { repo } = await setup();
    const created = await repo.createCustom({ nameEn: 'User Data Exercise', muscles: [] });

    await repo.setFavorite(created.id, true);
    await repo.setNote(created.id, 'Feels good at 3x8');
    await repo.setDefaultRest(created.id, 120);

    const found = await repo.findById(created.id);

    expect(found!.userData.isFavorite).toBe(true);
    expect(found!.userData.note).toBe('Feels good at 3x8');
    expect(found!.userData.defaultRestSeconds).toBe(120);
    // setNote after setFavorite must not clobber the favorite - each setter only touches its own column.
  });

  it('setNote does not clobber a previously-set favorite, and vice versa', async () => {
    const { repo } = await setup();
    const created = await repo.createCustom({
      nameEn: 'Independent Columns Exercise',
      muscles: [],
    });

    await repo.setFavorite(created.id, true);
    await repo.setNote(created.id, 'A note');

    const found = await repo.findById(created.id);
    expect(found!.userData.isFavorite).toBe(true);
    expect(found!.userData.note).toBe('A note');
  });
});

describe('SqliteExerciseRepository.findByCatalogSlug()', () => {
  it('finds a catalog exercise by its catalog slug', async () => {
    const { db, repo } = await setup();
    const id = await insertCatalogExercise(db, {
      catalogSlug: 'bench-press',
      nameEn: 'Bench Press',
    });

    const found = await repo.findByCatalogSlug('bench-press');

    expect(found?.id).toBe(id);
  });

  it('returns null for an unknown slug', async () => {
    const { repo } = await setup();
    expect(await repo.findByCatalogSlug('unknown-slug')).toBeNull();
  });
});

describe('SqliteExerciseRepository - custom-only mutation rule', () => {
  it('rejects updateCustom on a catalog-source exercise', async () => {
    const { db, repo } = await setup();
    const catalogId = await insertCatalogExercise(db);

    await expect(repo.updateCustom(catalogId, { nameEn: 'Hacked Name' })).rejects.toBeInstanceOf(
      ExerciseNotEditableError,
    );
    const stillOriginal = await repo.findById(catalogId);
    expect(stillOriginal!.nameEn).toBe('Catalog Exercise');
  });

  it('rejects deleteCustom on a catalog-source exercise', async () => {
    const { db, repo } = await setup();
    const catalogId = await insertCatalogExercise(db);

    await expect(repo.deleteCustom(catalogId)).rejects.toBeInstanceOf(ExerciseNotEditableError);
    expect(await repo.findById(catalogId)).not.toBeNull();
  });

  it('updateCustom on a missing id throws RepositoryNotFoundError', async () => {
    const { repo } = await setup();
    await expect(repo.updateCustom('does-not-exist', { nameEn: 'X' })).rejects.toBeInstanceOf(
      RepositoryNotFoundError,
    );
  });

  it('deleteCustom on a missing id throws RepositoryNotFoundError', async () => {
    const { repo } = await setup();
    await expect(repo.deleteCustom('does-not-exist')).rejects.toBeInstanceOf(
      RepositoryNotFoundError,
    );
  });

  it('accepts updateCustom and deleteCustom on a custom exercise', async () => {
    const { repo } = await setup();
    const created = await repo.createCustom({ nameEn: 'Editable Custom Exercise', muscles: [] });

    const updated = await repo.updateCustom(created.id, { nameEn: 'Edited Name' });
    expect(updated.nameEn).toBe('Edited Name');

    await repo.deleteCustom(created.id);
    expect(await repo.findById(created.id)).toBeNull();
  });
});

describe('SqliteExerciseRepository.listReferencingPlans()', () => {
  async function seedPlanReferencing(
    db: DatabaseContext,
    exerciseId: string,
    planName: string,
  ): Promise<string> {
    const now = Date.now();
    const planId = `plan-${Math.random().toString(36).slice(2)}`;
    const planDayId = `plan-day-${Math.random().toString(36).slice(2)}`;
    const pdeId = `pde-${Math.random().toString(36).slice(2)}`;
    await db.run(
      'INSERT INTO plan (id, name, is_active, sort_order, created_at, updated_at) VALUES (?, ?, 0, 0, ?, ?)',
      [planId, planName, now, now],
    );
    await db.run(
      'INSERT INTO plan_day (id, plan_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)',
      [planDayId, planId, 'Day 1', now, now],
    );
    await db.run(
      'INSERT INTO plan_day_exercise (id, plan_day_id, exercise_id, sort_order, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)',
      [pdeId, planDayId, exerciseId, now, now],
    );
    return planId;
  }

  it('returns the plans referencing the exercise', async () => {
    const { db, repo } = await setup();
    const exercise = await repo.createCustom({ nameEn: 'Referenced Exercise', muscles: [] });
    const planId = await seedPlanReferencing(db, exercise.id, 'Push Day');

    const refs = await repo.listReferencingPlans(exercise.id);

    expect(refs).toEqual([{ planId, planName: 'Push Day' }]);
  });

  it('dedupes when the exercise appears multiple times in the same plan', async () => {
    const { db, repo } = await setup();
    const exercise = await repo.createCustom({ nameEn: 'Twice Referenced Exercise', muscles: [] });
    const planId = await seedPlanReferencing(db, exercise.id, 'Full Body');
    // A second day in the same plan, referencing the same exercise again.
    const now = Date.now();
    const secondDayId = 'plan-day-second';
    await db.run(
      'INSERT INTO plan_day (id, plan_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)',
      [secondDayId, planId, 'Day 2', now, now],
    );
    await db.run(
      'INSERT INTO plan_day_exercise (id, plan_day_id, exercise_id, sort_order, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)',
      ['pde-second', secondDayId, exercise.id, now, now],
    );

    const refs = await repo.listReferencingPlans(exercise.id);

    expect(refs).toEqual([{ planId, planName: 'Full Body' }]);
  });

  it('returns an empty array when no plan references the exercise', async () => {
    const { repo } = await setup();
    const exercise = await repo.createCustom({ nameEn: 'Unreferenced Exercise', muscles: [] });

    expect(await repo.listReferencingPlans(exercise.id)).toEqual([]);
  });
});

describe('SqliteExerciseRepository.replaceCatalog()', () => {
  it('delegates to seedCatalog() and the resulting rows are searchable', async () => {
    const { repo } = await setup();

    await repo.replaceCatalog(
      [
        {
          catalogSlug: 'seeded-squat',
          nameEn: 'Seeded Squat',
          nameSearch: 'seeded squat',
          equipmentSlug: 'barbell',
          muscles: [{ slug: 'quadriceps', role: 'primary' }],
        },
      ],
      '1',
    );

    const results = await repo.search({ text: 'seeded squat' });
    expect(results).toHaveLength(1);
    expect(results[0]!.source).toBe('catalog');
  });
});

describe('SqliteExerciseRepository - transaction composition', () => {
  it('honors an explicit tx and rolls back with the caller-managed transaction', async () => {
    const { db, repo } = await setup();

    await expect(
      db.transaction(async (tx) => {
        await repo.createCustom({ nameEn: 'Rolled Back Exercise', muscles: [] }, tx);
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    expect((await repo.search({ text: 'rolled back' })).length).toBe(0);
  });
});
