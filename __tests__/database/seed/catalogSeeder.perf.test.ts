import type { CatalogExerciseEntry, CatalogFile } from '@/database/seed/catalogSeeder';
import { seedCatalog } from '@/database/seed/catalogSeeder';
import { seedLookupTables } from '@/database/seed/lookupSeeder';
import { MUSCLE_SEED } from '@/database/seed/muscleSeed';
import { EQUIPMENT_SEED } from '@/database/seed/equipmentSeed';
import { createTestDatabase } from '@/database/node/createTestDatabase';

/**
 * ADR-0011 decision 1 / this phase's roadmap acceptance criterion: seeding ~900
 * exercises (with muscle joins, equipment refs and the FTS rebuild) completes in
 * under 2 seconds behind the splash screen. This generates a ~900-exercise catalog
 * fixture shaped like the real thing (2 muscles + 1 video per exercise) and asserts
 * the wall-clock budget against `NodeSqlExecutor`, not an informal claim.
 *
 * `NodeSqlExecutor`/`node:sqlite` is not identical hardware to a mid-range phone,
 * but it is a meaningful, CI-enforced regression guard: if this budget starts
 * slipping here, it has already slipped worse on-device.
 */
function buildSyntheticCatalog(count: number): CatalogFile {
  const exercises: CatalogExerciseEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    const muscle = MUSCLE_SEED[i % MUSCLE_SEED.length]!;
    const secondaryMuscle = MUSCLE_SEED[(i + 1) % MUSCLE_SEED.length]!;
    const equipment = EQUIPMENT_SEED[i % EQUIPMENT_SEED.length]!;
    exercises.push({
      catalogSlug: `fixture-exercise-${i}`,
      nameEn: `Fixture Exercise ${i}`,
      nameSearch: `fixture exercise ${i}`,
      equipmentSlug: equipment.slug,
      bodyPart: muscle.bodyPart,
      instructions: ['Step one.', 'Step two.', 'Step three.'],
      images: [`fixture-exercise-${i}-1.webp`, `fixture-exercise-${i}-2.webp`],
      muscles: [
        { slug: muscle.slug, role: 'primary' },
        { slug: secondaryMuscle.slug, role: 'secondary' },
      ],
      videos: [{ url: `https://example.com/${i}`, title: `Fixture technique video ${i}` }],
    });
  }
  return { catalogVersion: 'perf-fixture-1', exercises };
}

describe('catalog seeding performance (ADR-0011 / roadmap P2 acceptance criterion)', () => {
  it('seeds ~900 exercises with muscles, equipment and FTS in under 2 seconds', async () => {
    const db = createTestDatabase();
    await seedLookupTables(db);
    const catalog = buildSyntheticCatalog(900);

    const startedAt = Date.now();
    const result = await seedCatalog(db, catalog);
    const elapsedMs = Date.now() - startedAt;

    expect(result).toMatchObject({ skipped: false, upsertedCount: 900 });

    const exerciseCount = await db.selectOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM exercise',
    );
    expect(exerciseCount?.count).toBe(900);

    const ftsCount = await db.selectOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM exercise_fts',
    );
    expect(ftsCount?.count).toBe(900);

    console.log(`Seeded 900 catalog exercises in ${elapsedMs}ms`);
    expect(elapsedMs).toBeLessThan(2000);
  });
});
