import { isRecordEligibleSetType, type SetType } from './Estimated1RM';
import {
  WEIGHT_AT_REPS_BUCKETS,
  type PersonalRecordSnapshot,
  type RecordType,
  type RepBucket,
} from '../types/PersonalRecord';

/**
 * Pure comparison half of ADR-0015 Decision 3 ("personal records are a
 * derived, rebuildable cache"). Given the current `PersonalRecord`-shaped
 * rows for one exercise and one newly-completed, already-known-eligible
 * `workout_set`-shaped input, returns which record types are beaten and what
 * their new value would be. No I/O, no SQL - the repository/service layer
 * (a later pass) is what actually reads current records and writes the
 * result; this function only decides.
 *
 * `max_session_volume` is deliberately NOT evaluated here - it needs an
 * entire session's total volume for this exercise, not one set's data, so it
 * cannot be decided from a single candidate set in isolation. It stays part
 * of `RECORD_TYPES` (the schema-level CHECK constraint includes it) but a
 * later pass's session-level aggregation is what evaluates it.
 *
 * Tie-breaking judgment call (ADR-0015 does not say): a tie does NOT beat an
 * existing record - only a strictly greater value creates a new current
 * record. Matching a personal best is still worth celebrating in the UI, but
 * it does not supersede the row that already holds that value, so the
 * PR timeline (ADR-0015's `is_current = 0` history) is not padded with
 * same-value entries for the exact number lifted before.
 */

export interface CandidateSetInput {
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceM: number | null;
  /** Pre-computed via `estimated1RM()`; `null` when ineligible or not applicable to this set. This function does not recompute it - `Estimated1RM.ts` is the one place that formula lives. */
  estimated1RmKg: number | null;
}

export interface BeatenRecord {
  recordType: RecordType;
  repBucket: RepBucket | null;
  newValue: number;
}

function findCurrent(
  currentRecords: readonly PersonalRecordSnapshot[],
  recordType: RecordType,
  repBucket: RepBucket | null,
): PersonalRecordSnapshot | undefined {
  return currentRecords.find(
    (record) => record.recordType === recordType && record.repBucket === repBucket,
  );
}

/** Strictly-greater-only, per this module's documented tie-breaking rule above. No current record for a slot means the candidate trivially beats it (the "first-ever PR" case). */
function beats(current: PersonalRecordSnapshot | undefined, candidateValue: number): boolean {
  return current === undefined || candidateValue > current.value;
}

function isPositiveFinite(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}

export function evaluateCandidateRecords(
  currentRecords: readonly PersonalRecordSnapshot[],
  candidate: CandidateSetInput,
): BeatenRecord[] {
  if (!isRecordEligibleSetType(candidate.setType)) {
    return [];
  }

  const beaten: BeatenRecord[] = [];

  if (isPositiveFinite(candidate.weightKg)) {
    const current = findCurrent(currentRecords, 'max_weight', null);
    if (beats(current, candidate.weightKg)) {
      beaten.push({ recordType: 'max_weight', repBucket: null, newValue: candidate.weightKg });
    }
  }

  if (isPositiveFinite(candidate.reps)) {
    const current = findCurrent(currentRecords, 'max_reps', null);
    if (beats(current, candidate.reps)) {
      beaten.push({ recordType: 'max_reps', repBucket: null, newValue: candidate.reps });
    }
  }

  if (isPositiveFinite(candidate.weightKg) && candidate.reps !== null) {
    const bucket = WEIGHT_AT_REPS_BUCKETS.find((value) => value === candidate.reps);
    if (bucket !== undefined) {
      const current = findCurrent(currentRecords, 'weight_at_reps', bucket);
      if (beats(current, candidate.weightKg)) {
        beaten.push({
          recordType: 'weight_at_reps',
          repBucket: bucket,
          newValue: candidate.weightKg,
        });
      }
    }
  }

  if (isPositiveFinite(candidate.weightKg) && candidate.reps !== null && candidate.reps > 0) {
    const volume = candidate.weightKg * candidate.reps;
    const current = findCurrent(currentRecords, 'max_set_volume', null);
    if (beats(current, volume)) {
      beaten.push({ recordType: 'max_set_volume', repBucket: null, newValue: volume });
    }
  }

  if (isPositiveFinite(candidate.estimated1RmKg)) {
    const current = findCurrent(currentRecords, 'estimated_1rm', null);
    if (beats(current, candidate.estimated1RmKg)) {
      beaten.push({
        recordType: 'estimated_1rm',
        repBucket: null,
        newValue: candidate.estimated1RmKg,
      });
    }
  }

  if (isPositiveFinite(candidate.durationSeconds)) {
    const current = findCurrent(currentRecords, 'max_duration', null);
    if (beats(current, candidate.durationSeconds)) {
      beaten.push({
        recordType: 'max_duration',
        repBucket: null,
        newValue: candidate.durationSeconds,
      });
    }
  }

  if (isPositiveFinite(candidate.distanceM)) {
    const current = findCurrent(currentRecords, 'max_distance', null);
    if (beats(current, candidate.distanceM)) {
      beaten.push({ recordType: 'max_distance', repBucket: null, newValue: candidate.distanceM });
    }
  }

  return beaten;
}
