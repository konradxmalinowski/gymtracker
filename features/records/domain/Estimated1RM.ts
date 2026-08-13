/**
 * ADR-0015 Decision 1 - estimated 1RM, Epley by default, Brzycki selectable.
 *
 * The formula itself is injected as a parameter rather than imported or
 * hardcoded, so `oneRm.formula` can select it at the call site and tests can
 * pin a formula independent of the settings layer. The guard rails matter
 * more than the formula choice (ADR-0015): every one of them returns `null`
 * rather than throwing, because a missing estimate is more honest than a
 * fabricated one.
 */

/**
 * `workout_set.set_type` CHECK constraint values (`database/schema.sql`), in
 * schema order.
 *
 * This union is a deliberate, value-identical duplicate of
 * `features/workout-logging/domain/setSemantics.ts`'s `SET_TYPES`/`SetType`,
 * not an independently invented one - the task that produced this file asked
 * for the workout-logging union to be reused directly, but
 * ARCHITECTURE.md section 9.1's module dependency graph is explicit that
 * "rest-timer and records do NOT depend on workout-logging - they are called
 * by it. Inverting this creates a cycle." Pass 2 of this phase wires
 * workout-logging -> records (the allowed direction) for PR evaluation on set
 * completion; if records also imported workout-logging's SetType, that
 * would be a real `import/no-cycle` violation by the time pass 2 lands, not
 * just a documentation one. Both unions are simply a transcription of the
 * same `workout_set.set_type` CHECK constraint, so they can only drift if the
 * schema itself changes - kept in sync by that shared source, not by import.
 */
export const SET_TYPES = ['warmup', 'normal', 'drop', 'failure', 'assisted', 'partial'] as const;

export type SetType = (typeof SET_TYPES)[number];

/**
 * Only `normal` and `failure` sets are eligible for e1RM or any personal
 * record (ADR-0015 Decision 1's guard rails; Decision 3's record-type
 * eligibility table). Mirrors `setSemantics.ts`'s `countsTowardPersonalRecord`
 * column exactly (`normal: true`, `failure: true`, everything else `false`).
 */
export const RECORD_ELIGIBLE_SET_TYPES: ReadonlySet<SetType> = new Set(['normal', 'failure']);

export function isRecordEligibleSetType(setType: SetType): boolean {
  return RECORD_ELIGIBLE_SET_TYPES.has(setType);
}

/** A 1RM formula: weight lifted and reps performed in, an estimated one-rep max out. */
export type OneRmFormula = (weightKg: number, reps: number) => number;

/** `w * (1 + reps / 30)` - the default (`oneRm.formula` = `'epley'`). Slightly generous at high reps; the most widely recognized. */
export const epleyFormula: OneRmFormula = (weightKg, reps) => weightKg * (1 + reps / 30);

/** `w * 36 / (37 - reps)` - selectable via `oneRm.formula` = `'brzycki'`. More accurate at 1-10 reps; undefined at 37 reps, which the `MAX_ELIGIBLE_REPS` guard below never lets this function reach. */
export const brzyckiFormula: OneRmFormula = (weightKg, reps) => (weightKg * 36) / (37 - reps);

/** Above this rep count the estimate is unreliable for everyone and wildly wrong for some (ADR-0015). */
export const MAX_ELIGIBLE_REPS = 12;

export interface Estimated1RMInput {
  weightKg: number;
  reps: number;
  setType: SetType;
}

/**
 * Returns an estimated one-rep max for a single completed set, or `null` when
 * the set is outside the range the estimate can be trusted for. Never throws.
 *
 * Guard order (ADR-0015 Decision 1):
 * 1. Only `normal`/`failure` sets are eligible - everything else is `null`.
 * 2. `weightKg <= 0` (or non-finite) is `null` - no load, no estimate.
 * 3. Non-finite or sub-1 reps is `null` - defensive; the ADR only specifies
 *    the reps === 1 and reps > 12 boundaries explicitly, but a 0-rep or
 *    negative-rep "set" was never actually performed, so there is nothing to
 *    estimate from.
 * 4. `reps === 1` returns the weight itself, not a formula result - a single
 *    already *is* (an approximation of) the 1RM.
 * 5. `reps > MAX_ELIGIBLE_REPS` (12) is `null`.
 * 6. Otherwise, the injected formula is applied.
 */
export function estimated1RM(input: Estimated1RMInput, formula: OneRmFormula): number | null {
  if (!isRecordEligibleSetType(input.setType)) {
    return null;
  }
  if (!Number.isFinite(input.weightKg) || input.weightKg <= 0) {
    return null;
  }
  if (!Number.isFinite(input.reps) || input.reps < 1) {
    return null;
  }
  if (input.reps === 1) {
    return input.weightKg;
  }
  if (input.reps > MAX_ELIGIBLE_REPS) {
    return null;
  }
  return formula(input.weightKg, input.reps);
}
