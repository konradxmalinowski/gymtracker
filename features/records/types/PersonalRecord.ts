/**
 * Minimal, domain-level shapes for personal records - ADR-0015 Decision 3's
 * record-type table (`database/schema.sql`'s `personal_record` table CHECK
 * constraint mirrors this list exactly). This is deliberately not the
 * repository's own type: no `id`, no `workout_set_id`/`session_id`, no
 * `is_current`/timestamps - `PersonalRecordRepository` (pass 2) defines its
 * own richer row type when it lands. `evaluateCandidateRecords.ts` only needs
 * enough to identify a record slot and compare a value against it.
 */

/** `personal_record.record_type` CHECK constraint values, in schema order. `max_session_volume` is listed for completeness but is out of scope for `evaluateCandidateRecords` - see that module's header comment. */
export const RECORD_TYPES = [
  'max_weight',
  'max_reps',
  'weight_at_reps',
  'max_set_volume',
  'max_session_volume',
  'estimated_1rm',
  'max_duration',
  'max_distance',
] as const;

export type RecordType = (typeof RECORD_TYPES)[number];

/** `weight_at_reps`'s fixed rep buckets (ADR-0015 Decision 3). */
export const WEIGHT_AT_REPS_BUCKETS = [1, 2, 3, 5, 8, 10, 12] as const;

export type RepBucket = (typeof WEIGHT_AT_REPS_BUCKETS)[number];

/**
 * One current-or-historical personal record row, reduced to what comparison
 * logic needs: which slot it occupies (`recordType` + `repBucket`, matching
 * `ux_pr_current`'s own `(exercise_id, record_type, IFNULL(rep_bucket, -1))`
 * uniqueness key) and its `value`.
 */
export interface PersonalRecordSnapshot {
  recordType: RecordType;
  /** Only meaningful for `weight_at_reps`; `null` for every other record type. */
  repBucket: RepBucket | null;
  value: number;
}
