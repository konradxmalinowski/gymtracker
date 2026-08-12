/**
 * Presentation-only formatting for `PersonalRecord` rows - shared by
 * `PersonalRecordsScreen` and the `ExerciseDetailScreen` personal-records
 * slot (`app/(tabs)/exercises/[id].tsx`) so the two surfaces never disagree
 * on what "max weight" or a weight value reads as. Deliberately not domain
 * code (it imports `t()` and lives under `components/`) - the record's
 * *value* is already fully computed by `evaluateCandidateRecords`/`rebuild()`;
 * this only decides how to print it.
 */
import { Weight } from '@/domain/Weight';
import { t } from '@/i18n';

import type { PersonalRecord } from '../repository/PersonalRecordRepository';
import type { RecordType } from '../types/PersonalRecord';

/** Record types whose `value` is a weight in kg (ADR-0015 Decision 3's record-type table). */
const WEIGHT_VALUE_RECORD_TYPES: ReadonlySet<RecordType> = new Set([
  'max_weight',
  'weight_at_reps',
  'max_set_volume',
  'max_session_volume',
  'estimated_1rm',
]);

export function recordTypeLabel(recordType: RecordType, repBucket: number | null): string {
  switch (recordType) {
    case 'max_weight':
      return t('records.list.recordTypeMaxWeight');
    case 'max_reps':
      return t('records.list.recordTypeMaxReps');
    case 'weight_at_reps':
      return t('records.list.recordTypeWeightAtRepsTemplate', { reps: repBucket ?? 0 });
    case 'max_set_volume':
      return t('records.list.recordTypeMaxSetVolume');
    case 'max_session_volume':
      return t('records.list.recordTypeMaxSessionVolume');
    case 'estimated_1rm':
      return t('records.list.recordTypeEstimated1Rm');
    case 'max_duration':
      return t('records.list.recordTypeMaxDuration');
    case 'max_distance':
      return t('records.list.recordTypeMaxDistance');
    default:
      return recordType;
  }
}

export function formatRecordValue(record: Pick<PersonalRecord, 'recordType' | 'value'>): string {
  if (WEIGHT_VALUE_RECORD_TYPES.has(record.recordType)) {
    return t('records.list.valueWeightTemplate', {
      value: Weight.fromKilograms(record.value).toDisplayString('kg'),
    });
  }
  if (record.recordType === 'max_reps') {
    return t('records.list.valueRepsTemplate', { value: Math.round(record.value) });
  }
  if (record.recordType === 'max_duration') {
    return t('records.list.valueDurationTemplate', { value: Math.round(record.value) });
  }
  if (record.recordType === 'max_distance') {
    return t('records.list.valueDistanceTemplate', { value: record.value });
  }
  return String(record.value);
}

/** `en-US` short date, e.g. "Aug 11, 2026" - the one absolute-date format this pass introduces; no existing shared date formatter to match (`utils/` has no such helper yet). */
export function formatAchievedDate(timestampMs: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(timestampMs));
}
