import type { SqlExecutor } from '@/repositories/contracts/database';
import { EQUIPMENT_SEED } from './equipmentSeed';
import { MUSCLE_SEED } from './muscleSeed';

/**
 * Idempotently upserts the fixed `muscle`/`equipment` vocabulary. Safe to call on
 * every app start (not just first launch) - it is a pure function of the constants
 * in `muscleSeed.ts`/`equipmentSeed.ts`, so a bumped `sort_order` or a corrected
 * `name_pl` in a future release lands automatically. Runs inside a caller-supplied
 * `tx` when one is passed so it can be composed into a larger seed transaction.
 */
export async function seedLookupTables(db: SqlExecutor): Promise<void> {
  for (const muscle of MUSCLE_SEED) {
    await db.run(
      `INSERT INTO muscle (slug, name_en, name_pl, body_part, sort_order)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET
         name_en = excluded.name_en,
         name_pl = excluded.name_pl,
         body_part = excluded.body_part,
         sort_order = excluded.sort_order`,
      [muscle.slug, muscle.nameEn, muscle.namePl, muscle.bodyPart, muscle.sortOrder],
    );
  }

  for (const equipment of EQUIPMENT_SEED) {
    await db.run(
      `INSERT INTO equipment (slug, name_en, name_pl, is_gym, is_home, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET
         name_en = excluded.name_en,
         name_pl = excluded.name_pl,
         is_gym = excluded.is_gym,
         is_home = excluded.is_home,
         sort_order = excluded.sort_order`,
      [
        equipment.slug,
        equipment.nameEn,
        equipment.namePl,
        equipment.isGym ? 1 : 0,
        equipment.isHome ? 1 : 0,
        equipment.sortOrder,
      ],
    );
  }
}
