/**
 * Public barrel for the "plans" feature.
 *
 * This is the ONLY surface other features may import from (ARCHITECTURE.md
 * section 3.1, rule 4 - enforced by the import/no-restricted-paths zones in
 * eslint.config.js). Reaching into "features/plans/<subfolder>/..." from any
 * other feature is a lint error; import from "@/features/plans" instead.
 *
 * Only `PlanService` (and the types/errors it speaks) is exported - never
 * `PlanRepository`/`SqlitePlanRepository`. Presentation (hooks, screens) must
 * go through the service, per ARCHITECTURE.md section 3.1 rule 3;
 * re-exporting the repository here would make that mistake one import away.
 * Mirrors `features/exercise-library/index.ts`'s precedent.
 */

export {
  PlanService,
  PLAN_NAME_MAX_LENGTH,
  PLAN_DAY_NAME_MAX_LENGTH,
  PLAN_DESCRIPTION_MAX_LENGTH,
  PLAN_DAY_NOTE_MAX_LENGTH,
  PLAN_DAY_EXERCISE_NOTE_MAX_LENGTH,
  type PlanServiceDependencies,
} from './services/PlanService';
export { PlanValidationError, SupersetMinimumSizeError } from './services/errors';
export { SupersetSpansMultipleDaysError } from './repository/errors';
export type {
  AddPlanDayExerciseInput,
  AddPlanDayInput,
  CreatePlanInput,
  PlanAggregate,
  PlanDay,
  PlanDayExercise,
  PlanListItem,
  UpdatePlanDayExercisePatch,
} from './repository/PlanRepository';
