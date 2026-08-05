import type { CatalogFile } from './catalogSeeder';

/**
 * Reads the real, build-time-generated catalog at `assets/data/exercises.catalog.json`
 * (produced by the parallel `scripts/build-catalog.ts` agent's work, per ADR-0011
 * decision 1 - not this phase's file to create). Not used by this phase's own
 * tests: the file does not exist yet on this branch, so every test in this phase
 * exercises `seedCatalog()` directly against a small fixture built in-test, per this
 * phase's own instructions. This function is the runtime bootstrap path a later
 * app-startup step (`app/_layout.tsx`, out of this phase's owned files) calls.
 *
 * A literal `require()` (not a static `import`) is used deliberately: with
 * `resolveJsonModule` + TypeScript's `bundler` module resolution, a static `import`
 * of a path that does not exist on disk yet fails `tsc --noEmit` immediately. A
 * plain `require()` call is typed as `(id: string) => any` by `@types/node`'s
 * `NodeRequire` and is not resolved against the filesystem by the type checker, so
 * this compiles today and will bundle correctly once the JSON file exists.
 */
export function loadCatalogAsset(): CatalogFile {
  return require('../../assets/data/exercises.catalog.json') as CatalogFile;
}
