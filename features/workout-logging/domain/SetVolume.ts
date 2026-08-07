import { SET_TYPE_SEMANTICS, type SetType } from './setSemantics';

/**
 * `SetVolume` - ARCHITECTURE.md section 6.2. The TypeScript half of the
 * two-implementation volume rule; the other half is `v_working_set.volume_kg`
 * in `database/schema.sql`:
 *
 * ```sql
 * CASE
 *   WHEN ws.set_type IN ('warmup','assisted','partial') THEN 0.0
 *   WHEN ws.weight_kg IS NULL OR ws.reps IS NULL        THEN 0.0
 *   ELSE ws.weight_kg * ws.reps
 * END
 * ```
 *
 * The branch order below mirrors that CASE exactly, including the fact that the
 * set-type test comes first: a `warmup` with a NULL weight and a `warmup` with
 * 60 kg x 10 both yield 0, and neither falls through to the null check.
 */
export interface SetVolumeInput {
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
}

/** Volume in kilograms for a single set, per the ADR-0006 semantics table. Never negative, never `NaN` for well-formed input. */
export function setVolumeKg(set: SetVolumeInput): number {
  if (!SET_TYPE_SEMANTICS[set.setType].countsTowardVolume) {
    return 0;
  }
  if (set.weightKg === null || set.reps === null) {
    return 0;
  }
  return set.weightKg * set.reps;
}

/** Sum of {@link setVolumeKg} over a collection. Callers filter for completion/soft-deletion themselves - this function has no opinion about which sets belong in the sum. */
export function totalVolumeKg(sets: readonly SetVolumeInput[]): number {
  let total = 0;
  for (const set of sets) {
    total += setVolumeKg(set);
  }
  return total;
}
