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

/**
 * P8 pass 3 (docs/ROADMAP.md): the presentational components and
 * presentation hooks land here. `workout-logging` imports `PRBadge`/
 * `ProgressionHint` through this barrel (the allowed `workout-logging ->
 * records` direction); `app/(tabs)/exercises/[id].tsx` and `profile`'s
 * `SettingsScreen` import the hooks the same way.
 *
 * `useCurrentRecords`/`useRecentRecords`/`useRebuildRecords`
 * (`hooks/useRecords.ts`) take their `PersonalRecordService` as a parameter
 * rather than calling `useContainer()` internally - `services/container.ts`
 * itself imports `PersonalRecordService` from this barrel, so a hook here
 * that imported `@/services/container` directly would close a real import
 * cycle (barrel -> hook -> container -> barrel). See that file's own header
 * comment; this mirrors `useStartWorkout(sessionService)`'s existing
 * precedent in `workout-logging`'s barrel.
 *
 * `PersonalRecordsScreen` (`screens/PersonalRecordsScreen.tsx`) and
 * `useRecordExerciseNames` (`hooks/useRecordExerciseNames.ts`) are
 * deliberately NOT re-exported here, matching every other feature's own
 * barrel: no screen is ever barrel-exported in this codebase (`app/` always
 * imports a screen by its direct file path - see `ProfileScreen`/
 * `ExerciseDetailScreen`'s own route wrappers), and
 * `useRecordExerciseNames` is a same-feature implementation detail of that
 * one screen, not a cross-feature surface.
 */
export { PRBadge, type PRBadgeProps } from './components/PRBadge';
export { ProgressionHint, type ProgressionHintProps } from './components/ProgressionHint';
export {
  formatAchievedDate,
  formatRecordValue,
  recordTypeLabel,
} from './components/personalRecordFormatting';
export {
  recordKeys,
  useCurrentRecords,
  useRebuildRecords,
  useRecentRecords,
} from './hooks/useRecords';
