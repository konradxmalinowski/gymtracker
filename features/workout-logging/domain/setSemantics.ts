/**
 * ADR-0006 / ARCHITECTURE.md section 6.3 - the normative set-type semantics
 * table, expressed once, in code. `SetVolume` and `SessionTotals` both read it;
 * neither re-derives the rules, so "warmup does not count" is written down in
 * exactly one place.
 *
 * The other implementation of the volume half of this table is the
 * `v_working_set` SQL view (`database/schema.sql`). The two are kept honest by
 * `__tests__/features/workout-logging/domain/SetVolume.test.ts`, which runs a
 * generated matrix through both and asserts identical results - ADR-0006 calls
 * that test "not optional".
 */

/** `workout_set.set_type` CHECK constraint, in schema order. `superset` is deliberately absent (ADR-0006). */
export const SET_TYPES = ['warmup', 'normal', 'drop', 'failure', 'assisted', 'partial'] as const;

export type SetType = (typeof SET_TYPES)[number];

export interface SetTypeSemantics {
  /** Volume column of the 6.3 table. */
  countsTowardVolume: boolean;
  /** PR / e1RM column. Nothing in P6 reads this - `PersonalRecordRepository` lands in P8 - but the rule belongs with the other two, not scattered into a later phase. */
  countsTowardPersonalRecord: boolean;
  /** "Counts toward sets completed" column - `drop` is false because a drop segment is part of its parent's single effort. */
  countsTowardSetCount: boolean;
  /** What `weight_kg` means for this type. `assisted` stores the assistance magnitude as a positive number (ADR-0006). */
  weightMeaning: 'external_load' | 'assistance';
}

export const SET_TYPE_SEMANTICS: Readonly<Record<SetType, SetTypeSemantics>> = {
  warmup: {
    countsTowardVolume: false,
    countsTowardPersonalRecord: false,
    countsTowardSetCount: false,
    weightMeaning: 'external_load',
  },
  normal: {
    countsTowardVolume: true,
    countsTowardPersonalRecord: true,
    countsTowardSetCount: true,
    weightMeaning: 'external_load',
  },
  drop: {
    countsTowardVolume: true,
    countsTowardPersonalRecord: false,
    countsTowardSetCount: false,
    weightMeaning: 'external_load',
  },
  failure: {
    countsTowardVolume: true,
    countsTowardPersonalRecord: true,
    countsTowardSetCount: true,
    weightMeaning: 'external_load',
  },
  assisted: {
    countsTowardVolume: false,
    countsTowardPersonalRecord: false,
    countsTowardSetCount: true,
    weightMeaning: 'assistance',
  },
  partial: {
    countsTowardVolume: false,
    countsTowardPersonalRecord: false,
    countsTowardSetCount: true,
    weightMeaning: 'external_load',
  },
};

export function isSetType(value: unknown): value is SetType {
  return typeof value === 'string' && (SET_TYPES as readonly string[]).includes(value);
}
