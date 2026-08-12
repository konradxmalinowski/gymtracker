/**
 * Public barrel for the "records" feature.
 *
 * This is the ONLY surface other features may import from (ARCHITECTURE.md
 * section 3.1, rule 4 - enforced by the import/no-restricted-paths zones in
 * eslint.config.js). Reaching into "features/records/<subfolder>/..." from any
 * other feature is a lint error; import from "@/features/records" instead.
 *
 * P8 pass 2 (docs/ROADMAP.md): the repository interface, its DTOs and
 * `PersonalRecordService` land here now. `SqlitePersonalRecordRepository` is
 * deliberately NOT exported - only the interface type and the service,
 * mirroring every other feature barrel's "never the Sqlite implementation
 * class" rule. `records` stays a leaf per ARCHITECTURE.md section 9.1's
 * module dependency graph (it does not depend on `workout-logging`;
 * `workout-logging` depends on it as of this pass, for PR evaluation inside
 * `completeSet`'s transaction - the allowed direction).
 */

export {
  epleyFormula,
  brzyckiFormula,
  estimated1RM,
  isRecordEligibleSetType,
  MAX_ELIGIBLE_REPS,
  RECORD_ELIGIBLE_SET_TYPES,
  SET_TYPES,
  type Estimated1RMInput,
  type OneRmFormula,
  type SetType,
} from './domain/Estimated1RM';

export {
  LOWER_BODY_PARTS,
  suggestNextProgression,
  UPPER_BODY_PARTS,
  type ProgressionAdviceInput,
  type ProgressionIncrements,
  type ProgressionSuggestion,
  type RepRange,
  type WorkingSetPerformance,
} from './domain/ProgressionAdvisor';

export {
  evaluateCandidateRecords,
  type BeatenRecord,
  type CandidateSetInput,
} from './domain/evaluateCandidateRecords';

export {
  RECORD_TYPES,
  WEIGHT_AT_REPS_BUCKETS,
  type PersonalRecordSnapshot,
  type RecordType,
  type RepBucket,
} from './types/PersonalRecord';

export type {
  PersonalRecord,
  PersonalRecordRepository,
  RecordCandidateSet,
} from './repository/PersonalRecordRepository';

export {
  PersonalRecordService,
  type PersonalRecordServiceDependencies,
} from './services/PersonalRecordService';
export { RecordValidationError } from './services/errors';
