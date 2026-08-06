/**
 * Public barrel for the "exercise-library" feature.
 *
 * This is the ONLY surface other features may import from (ARCHITECTURE.md
 * section 3.1, rule 4 - enforced by the import/no-restricted-paths zones in
 * eslint.config.js). Reaching into "features/exercise-library/<subfolder>/..." from any
 * other feature is a lint error; import from "@/features/exercise-library" instead.
 *
 * Only `ExerciseService` (and the types it speaks) is exported - never
 * `ExerciseRepository`/`SqliteExerciseRepository`. Presentation (hooks, screens
 * in the next phase) must go through the service, per ARCHITECTURE.md section
 * 3.1 rule 3; re-exporting the repository here would make that mistake one
 * import away. Mirrors `features/profile/index.ts`'s precedent.
 */

export {
  ExerciseService,
  EXERCISE_NAME_MAX_LENGTH,
  EXERCISE_NOTE_MAX_LENGTH,
  EXERCISE_REST_SECONDS_MAX,
  type ExerciseServiceDependencies,
} from './services/ExerciseService';
export { ExerciseDeleteBlockedError, ExerciseValidationError } from './services/errors';
export { formatExerciseName, type ExerciseNameParts } from './domain/formatExerciseName';
export { ExerciseNotEditableError } from './repository/errors';
export type {
  CreateCustomExerciseInput,
  Exercise,
  ExerciseContext,
  ExerciseForce,
  ExerciseLevel,
  ExerciseListItem,
  ExerciseMechanic,
  ExerciseMuscleRef,
  ExerciseQuery,
  ExerciseSource,
  ExerciseTrackingType,
  ExerciseUserData,
  ExerciseVideo,
  MuscleRole,
  PlanReference,
  UpdateCustomExercisePatch,
} from './repository/ExerciseRepository';
