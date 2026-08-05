import type { DatabaseContext } from '@/repositories/contracts/database';
import { type CatalogFile, type CatalogSeedResult, seedCatalog } from './catalogSeeder';
import { seedLookupTables } from './lookupSeeder';

export * from './catalogSeeder';
export * from './equipmentSeed';
export * from './loadCatalogAsset';
export * from './lookupSeeder';
export * from './muscleSeed';

export interface RunSeedResult {
  catalog: CatalogSeedResult;
}

/**
 * Full first-launch (and every-launch) seed bootstrap: fixed lookup vocabulary
 * first (a dependency of the exercise catalog's foreign keys), then the versioned
 * catalog seed. Target: behind the splash screen in under 2 seconds for ~900
 * exercises (ADR-0011) - the catalog step is the one benchmarked in
 * `__tests__/database/seed/catalogSeeder.perf.test.ts`; the lookup step is ~30 rows
 * and negligible by comparison.
 */
export async function runSeed(db: DatabaseContext, catalog: CatalogFile): Promise<RunSeedResult> {
  await seedLookupTables(db);
  const catalogResult = await seedCatalog(db, catalog);
  return { catalog: catalogResult };
}
