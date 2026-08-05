import { createTestDatabase } from '@/database/node/createTestDatabase';
import type { NodeSqlExecutor } from '@/database/node/NodeSqlExecutor';
import { EQUIPMENT_SEED } from '@/database/seed/equipmentSeed';
import { seedLookupTables } from '@/database/seed/lookupSeeder';
import { MUSCLE_SEED } from '@/database/seed/muscleSeed';

describe('seedLookupTables', () => {
  let db: NodeSqlExecutor;

  beforeEach(() => {
    db = createTestDatabase();
  });

  it('inserts every muscle and equipment row', async () => {
    await seedLookupTables(db);

    const muscles = await db.select('SELECT slug FROM muscle');
    const equipment = await db.select('SELECT slug FROM equipment');
    expect(muscles).toHaveLength(MUSCLE_SEED.length);
    expect(equipment).toHaveLength(EQUIPMENT_SEED.length);
  });

  it('is idempotent - re-running does not duplicate or error', async () => {
    await seedLookupTables(db);
    await expect(seedLookupTables(db)).resolves.toBeUndefined();

    const muscles = await db.select('SELECT slug FROM muscle');
    expect(muscles).toHaveLength(MUSCLE_SEED.length);
  });

  it('updates an existing row in place on re-run (upsert, not insert-only)', async () => {
    await seedLookupTables(db);
    await db.run("UPDATE muscle SET name_en = 'Temporarily Wrong' WHERE slug = 'chest'");

    await seedLookupTables(db);

    const row = await db.selectOne<{ name_en: string }>(
      'SELECT name_en FROM muscle WHERE slug = ?',
      ['chest'],
    );
    expect(row?.name_en).toBe('Chest');
  });
});
