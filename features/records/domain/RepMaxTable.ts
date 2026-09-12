/**
 * Gravitus-inspired refresh: a rep-max table (1 through `MAX_ELIGIBLE_REPS`)
 * derived from an already-computed estimated 1RM, by inverting whichever
 * formula (`epleyFormula`/`brzyckiFormula`, both from `./Estimated1RM`)
 * produced it - domain-pure per `gymtracker/domain-purity` (no React/RN/Expo
 * import), same as every other file in this directory.
 *
 * `OneRmFormula` (`./Estimated1RM`) is a plain function type, not a
 * discriminated string union, so "which formula" is determined here by
 * reference equality against the two named exports rather than a passed-in
 * key - `resolveFormula` (`SqlitePersonalRecordRepository`/
 * `SqliteStatisticsRepository`) already resolves `oneRm.formula` down to one
 * of these two function references before a caller ever reaches domain code,
 * so this file never needs to know the setting's own string encoding.
 * Anything other than `brzyckiFormula` by reference is treated as Epley -
 * the schema only ever produces one of these two today, and Epley is the
 * documented default (ADR-0015).
 *
 * Inverses (ADR-0015's formulas solved for `weightKg`):
 * - Epley: `e1RM = w * (1 + reps / 30)` => `w = e1RM / (1 + reps / 30)`.
 * - Brzycki: `e1RM = w * 36 / (37 - reps)` => `w = e1RM * (37 - reps) / 36`.
 *
 * `reps === 1` always returns the e1RM itself (both formulas agree there,
 * and `estimated1RM`'s own guard treats a 1-rep set as *being* the 1RM
 * rather than a formula result) - mirroring `estimated1RM`'s own special
 * case for symmetry, not a separate design decision.
 */
import { brzyckiFormula, MAX_ELIGIBLE_REPS, type OneRmFormula } from './Estimated1RM';

export interface RepMaxEntry {
  reps: number;
  weightKg: number;
}

/**
 * Returns one entry per rep count from 1 to `MAX_ELIGIBLE_REPS`, ascending.
 * Never throws: a non-finite or non-positive `estimatedOneRepMaxKg` returns
 * an empty table (nothing to invert, the same "silence is more honest than a
 * fabricated number" precedent `estimated1RM` itself follows) rather than
 * producing negative or `NaN` weights.
 */
export function computeRepMaxTable(
  estimatedOneRepMaxKg: number,
  formula: OneRmFormula,
): RepMaxEntry[] {
  if (!Number.isFinite(estimatedOneRepMaxKg) || estimatedOneRepMaxKg <= 0) {
    return [];
  }

  const isBrzycki = formula === brzyckiFormula;
  const entries: RepMaxEntry[] = [];

  for (let reps = 1; reps <= MAX_ELIGIBLE_REPS; reps += 1) {
    const weightKg =
      reps === 1
        ? estimatedOneRepMaxKg
        : isBrzycki
          ? (estimatedOneRepMaxKg * (37 - reps)) / 36
          : estimatedOneRepMaxKg / (1 + reps / 30);
    entries.push({ reps, weightKg });
  }

  return entries;
}
