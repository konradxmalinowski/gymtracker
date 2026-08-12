/**
 * Public barrel for the "workout-logging" feature.
 *
 * This is the ONLY surface other features may import from (ARCHITECTURE.md
 * section 3.1, rule 4 - enforced by the import/no-restricted-paths zones in
 * eslint.config.js). Reaching into "features/workout-logging/<subfolder>/..." from any
 * other feature is a lint error; import from "@/features/workout-logging" instead.
 *
 * Only `WorkoutSessionService` (plus the types, errors and pure domain
 * calculators it speaks) is exported - never
 * `WorkoutSessionRepository`/`SqliteWorkoutSessionRepository`. Presentation
 * goes through the service, per ARCHITECTURE.md section 3.1 rule 3;
 * re-exporting the repository here would make that mistake one import away.
 * Mirrors `features/plans/index.ts`'s precedent.
 *
 * The domain calculators are exported because presentation genuinely needs
 * them: the workout screen renders a running volume total and drop-set display
 * numbers while the session is still in progress, from the Zustand mirror
 * rather than from a database read.
 */

export {
  WorkoutSessionService,
  SESSION_TITLE_MAX_LENGTH,
  WORKOUT_NOTE_MAX_LENGTH,
  type ActiveSessionSnapshot,
  type StartSessionResult,
  type WorkoutSessionServiceDependencies,
} from './services/WorkoutSessionService';
export { SessionSupersetMinimumSizeError, WorkoutValidationError } from './services/errors';
export {
  DropSegmentSetTypeError,
  DropSetParentInvalidError,
  SessionAlreadyInProgressError,
  SessionNotInProgressError,
  SupersetSpansMultipleSessionsError,
} from './repository/errors';
export type {
  ActiveSessionAggregate,
  ActiveSessionState,
  ActiveStatePatch,
  CompleteSetValues,
  CompletedSetResult,
  SessionExercise,
  SessionStatus,
  SessionSummary,
  SetSeed,
  UpdateSetPatch,
  WorkoutSet,
} from './repository/WorkoutSessionRepository';
/**
 * `ExerciseHistoryRepository` (P8 pass 2) - the read-model interface type
 * only, never `SqliteExerciseHistoryRepository`, same "never the Sqlite
 * implementation class" rule every other export in this barrel follows.
 * Exported so Pass 3's `useExerciseHistory` hook (and any other presentation
 * consumer) can type against it without reaching into
 * `features/workout-logging/repository/` directly.
 */
export type {
  BestPerformance,
  ExerciseHistoryRepository,
  ExerciseSessionEntry,
  PreviousPerformance,
  PreviousPerformanceSet,
} from './repository/ExerciseHistoryRepository';

export { setVolumeKg, totalVolumeKg, type SetVolumeInput } from './domain/SetVolume';
export {
  computeSessionTotals,
  sessionDurationSeconds,
  type SessionDurationInput,
  type SessionTotals,
  type SessionTotalsSetInput,
} from './domain/SessionTotals';
export {
  assignSetDisplayNumbers,
  orderSetsForDisplay,
  type NumberableSet,
  type SetDisplayNumber,
} from './domain/setDisplayNumbering';
export { isSessionStale, type SessionStalenessInput } from './domain/sessionStaleness';
export {
  SET_TYPES,
  SET_TYPE_SEMANTICS,
  isSetType,
  type SetType,
  type SetTypeSemantics,
} from './domain/setSemantics';

/**
 * `useStartWorkout` is a presentation-layer hook, not a service or domain
 * export - an exception to this barrel's own "only the service and the
 * types/errors/calculators it speaks" rule (see this file's header), made
 * because the route graph (ARCHITECTURE.md section 10.1: `PLDD -->|Start
 * Workout| ACT`) treats "start a workout from a plan day" as a first-class
 * cross-feature action, not something `workout-logging` keeps to itself.
 * `features/plans/screens/PlanDetailScreen.tsx` is this export's one real
 * consumer today - it needs the exact same ADR-0005 mechanism 6 MMKV writes,
 * store hydration and navigation this feature's own start entry points use,
 * and duplicating that sequence in `plans` instead of exporting it once here
 * is exactly the kind of drift CLAUDE.md's "no direct repository access,
 * one door in" rule exists to prevent one level up.
 */
export { useStartWorkout, type UseStartWorkoutResult } from './hooks/useStartWorkout';

/**
 * P8 pass 3: `usePreviousPerformance`/`useProgressionSuggestion` are this
 * feature's presentation-facing wrapper over the read-only
 * `ExerciseHistoryRepository` (no accompanying service, by design - see the
 * repository's own doc comment). Both take their repository/settings
 * dependencies as parameters instead of calling `useContainer()` internally
 * - see `hooks/useExerciseHistory.ts`'s own header comment for why (the same
 * import-cycle reason `useStartWorkout(sessionService)` above already
 * establishes precedent for). `app/(tabs)/exercises/[id].tsx` and
 * `SessionExerciseCard.tsx` are this export's callers, both already holding
 * `useContainer()` themselves.
 */
export {
  exerciseHistoryKeys,
  usePreviousPerformance,
  useProgressionSuggestion,
  type UseProgressionSuggestionDependencies,
  type UseProgressionSuggestionInput,
} from './hooks/useExerciseHistory';
