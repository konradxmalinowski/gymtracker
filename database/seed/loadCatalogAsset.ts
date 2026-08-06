import type { CatalogExerciseEntry, CatalogFile, CatalogMuscleRef } from './catalogSeeder';

/**
 * The on-disk shape of `assets/data/exercises.catalog.json`, as actually emitted by
 * `scripts/build-catalog.ts` (a parallel P2 agent's file) - confirmed by reading a
 * sample entry, not assumed. It differs from `CatalogFile`/`CatalogExerciseEntry` in
 * exactly one way: `primaryMuscles`/`secondaryMuscles: string[]` instead of the
 * combined `muscles: {slug, role}[]` the seeder expects. Every other field lines up
 * field-for-field.
 */
interface RawCatalogExerciseEntry extends Omit<CatalogExerciseEntry, 'muscles'> {
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
}

interface RawCatalogFile {
  catalogVersion: string;
  exercises: RawCatalogExerciseEntry[];
}

/**
 * Maps one raw catalog entry's `primaryMuscles`/`secondaryMuscles` into the
 * `muscles: {slug, role}[]` shape `catalogSeeder.seedCatalog()` expects. Exported so
 * `__tests__/database/seed/loadCatalogAsset.test.ts` can exercise the mapping
 * directly against a small fixture, without loading the real ~1.1 MB catalog file.
 */
export function mapRawCatalogExerciseEntry(entry: RawCatalogExerciseEntry): CatalogExerciseEntry {
  const { primaryMuscles, secondaryMuscles, ...rest } = entry;
  const muscles: CatalogMuscleRef[] = [
    ...(primaryMuscles ?? []).map((slug): CatalogMuscleRef => ({ slug, role: 'primary' })),
    ...(secondaryMuscles ?? []).map((slug): CatalogMuscleRef => ({ slug, role: 'secondary' })),
  ];
  return { ...rest, muscles };
}

/** Maps a raw parsed catalog file into the `CatalogFile` shape `seedCatalog()` consumes. */
export function mapRawCatalogFile(raw: RawCatalogFile): CatalogFile {
  return {
    catalogVersion: raw.catalogVersion,
    exercises: raw.exercises.map(mapRawCatalogExerciseEntry),
  };
}

/**
 * Reads the real, build-time-generated catalog at `assets/data/exercises.catalog.json`
 * (produced by `scripts/build-catalog.ts`) and adapts it into the shape
 * `catalogSeeder.seedCatalog()` expects. This function is the runtime bootstrap path
 * a later app-startup step (`app/_layout.tsx`, out of this phase's owned files)
 * calls.
 *
 * The raw JSON on disk emits `primaryMuscles`/`secondaryMuscles: string[]` per
 * exercise, not `seedCatalog()`'s `muscles: {slug, role}[]` - a field-name mismatch
 * between `scripts/build-catalog.ts` (P2) and `catalogSeeder.ts` (P2, a different
 * agent's file) that nothing previously reconciled. Calling `seedCatalog()` with the
 * raw shape cast as-is would silently seed every one of the 873 catalog exercises
 * with zero muscles (`entry.muscles ?? []` always evaluating to `[]`), quietly
 * breaking the muscle filter and detail-screen muscle tags. `mapRawCatalogFile()`
 * above is the adapter; this function is just the disk read plus that adapter.
 *
 * A literal `require()` (not a static `import`) is used deliberately: with
 * `resolveJsonModule` + TypeScript's `bundler` module resolution, a static `import`
 * of a path that does not exist on disk yet fails `tsc --noEmit` immediately. A
 * plain `require()` call is typed as `(id: string) => any` by `@types/node`'s
 * `NodeRequire` and is not resolved against the filesystem by the type checker, so
 * this compiles today and will bundle correctly once the JSON file exists.
 */
export function loadCatalogAsset(): CatalogFile {
  const raw = require('../../assets/data/exercises.catalog.json') as RawCatalogFile;
  return mapRawCatalogFile(raw);
}
