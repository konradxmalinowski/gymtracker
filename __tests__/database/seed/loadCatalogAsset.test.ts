import { mapRawCatalogExerciseEntry, mapRawCatalogFile } from '@/database/seed/loadCatalogAsset';

/**
 * Exercises the `primaryMuscles`/`secondaryMuscles` -> `muscles: {slug, role}[]`
 * mapping against a small fixture shaped like a real `exercises.catalog.json`
 * entry (confirmed against the real file, not guessed), rather than loading the
 * actual ~1.1 MB catalog asset in a unit test.
 */
describe('mapRawCatalogExerciseEntry()', () => {
  it('maps primaryMuscles and secondaryMuscles into a combined muscles array with roles', () => {
    const entry = mapRawCatalogExerciseEntry({
      catalogSlug: '3-4-sit-up',
      nameEn: '3/4 Sit-Up',
      namePl: null,
      nameSearch: '3/4 sit-up',
      aliases: [],
      category: 'strength',
      force: 'pull',
      mechanic: 'compound',
      level: 'beginner',
      equipmentSlug: 'body only',
      bodyPart: 'core',
      trackingType: 'weight_reps',
      instructions: ['Lie down on the floor and secure your feet.'],
      images: ['26e9975d65f43036.webp', 'ca79885d0ca86a84.webp'],
      primaryMuscles: ['abdominals'],
      secondaryMuscles: ['hip flexors'],
    });

    expect(entry.muscles).toEqual([
      { slug: 'abdominals', role: 'primary' },
      { slug: 'hip flexors', role: 'secondary' },
    ]);
  });

  it('produces an empty muscles array when both fields are absent', () => {
    const entry = mapRawCatalogExerciseEntry({
      catalogSlug: 'no-muscles',
      nameEn: 'No Muscles',
      namePl: null,
      nameSearch: 'no muscles',
      aliases: [],
      category: null,
      force: null,
      mechanic: null,
      level: null,
      equipmentSlug: null,
      bodyPart: null,
      trackingType: 'weight_reps',
      instructions: [],
      images: [],
    });

    expect(entry.muscles).toEqual([]);
  });

  it('produces only primary entries when secondaryMuscles is an empty array', () => {
    const entry = mapRawCatalogExerciseEntry({
      catalogSlug: 'primary-only',
      nameEn: 'Primary Only',
      namePl: null,
      nameSearch: 'primary only',
      aliases: [],
      category: null,
      force: null,
      mechanic: null,
      level: null,
      equipmentSlug: null,
      bodyPart: null,
      trackingType: 'weight_reps',
      instructions: [],
      images: [],
      primaryMuscles: ['chest'],
      secondaryMuscles: [],
    });

    expect(entry.muscles).toEqual([{ slug: 'chest', role: 'primary' }]);
  });

  it('preserves every other field unchanged', () => {
    const entry = mapRawCatalogExerciseEntry({
      catalogSlug: '3-4-sit-up',
      nameEn: '3/4 Sit-Up',
      namePl: 'Test PL Name',
      nameSearch: '3/4 sit-up',
      aliases: ['crunch variant'],
      category: 'strength',
      force: 'pull',
      mechanic: 'compound',
      level: 'beginner',
      equipmentSlug: 'body only',
      bodyPart: 'core',
      trackingType: 'weight_reps',
      instructions: ['Step 1.', 'Step 2.'],
      images: ['a.webp'],
      primaryMuscles: ['abdominals'],
    });

    expect(entry).toMatchObject({
      catalogSlug: '3-4-sit-up',
      nameEn: '3/4 Sit-Up',
      namePl: 'Test PL Name',
      nameSearch: '3/4 sit-up',
      aliases: ['crunch variant'],
      category: 'strength',
      force: 'pull',
      mechanic: 'compound',
      level: 'beginner',
      equipmentSlug: 'body only',
      bodyPart: 'core',
      trackingType: 'weight_reps',
      instructions: ['Step 1.', 'Step 2.'],
      images: ['a.webp'],
    });
  });
});

describe('mapRawCatalogFile()', () => {
  it('maps catalogVersion through and every exercise via mapRawCatalogExerciseEntry', () => {
    const file = mapRawCatalogFile({
      catalogVersion: '1',
      exercises: [
        {
          catalogSlug: 'ex-1',
          nameEn: 'Exercise One',
          namePl: null,
          nameSearch: 'exercise one',
          aliases: [],
          category: null,
          force: null,
          mechanic: null,
          level: null,
          equipmentSlug: null,
          bodyPart: null,
          trackingType: 'weight_reps',
          instructions: [],
          images: [],
          primaryMuscles: ['chest'],
          secondaryMuscles: ['triceps'],
        },
        {
          catalogSlug: 'ex-2',
          nameEn: 'Exercise Two',
          namePl: null,
          nameSearch: 'exercise two',
          aliases: [],
          category: null,
          force: null,
          mechanic: null,
          level: null,
          equipmentSlug: null,
          bodyPart: null,
          trackingType: 'reps_only',
          instructions: [],
          images: [],
        },
      ],
    });

    expect(file.catalogVersion).toBe('1');
    expect(file.exercises).toHaveLength(2);
    expect(file.exercises[0]!.muscles).toEqual([
      { slug: 'chest', role: 'primary' },
      { slug: 'triceps', role: 'secondary' },
    ]);
    expect(file.exercises[1]!.muscles).toEqual([]);
  });
});
