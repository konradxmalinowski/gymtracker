/**
 * Public barrel for the "home" feature.
 *
 * This is the ONLY surface other features may import from (ARCHITECTURE.md
 * section 3.1, rule 4). Nothing depends on `home` today (it is a read-side
 * leaf per section 9.1's dependency graph - `workout-logging`, `plans` and
 * `records` are its dependencies, not the reverse), but this barrel exists
 * from the start anyway, matching every other feature's own precedent.
 *
 * Only the pure domain calculators and the read-model repository's
 * interface/DTOs are exported here (this phase's first slice) - never
 * `SqliteHomeDashboardRepository`, the same "never the Sqlite implementation
 * class" rule every other feature barrel in this codebase follows. There is
 * no accompanying service (nothing to Zod-validate on a read-only path),
 * mirroring `ExerciseHistoryRepository`'s own precedent in
 * `workout-logging`'s barrel.
 *
 * The presentation slice (hooks/components) below is this phase's second
 * pass. `HomeScreen` is deliberately NOT re-exported here, matching every
 * other feature's own barrel: no screen is ever barrel-exported in this
 * codebase - `app/(tabs)/index.tsx` imports it by direct file path instead,
 * the same precedent `ProfileScreen`/`PersonalRecordsScreen`/
 * `PlanDetailScreen` already established for their own route wrappers.
 */

export { calculateStreak } from './domain/StreakCalculator';
export { nextSuggestedPlanDay, type PlanDayRotationCandidate } from './domain/nextSuggestedPlanDay';

export type {
  HomeDashboardRepository,
  HomeLastSessionDto,
  HomeWeeklySummary,
} from './repository/HomeDashboardRepository';

export {
  homeDashboardKeys,
  useHomeDashboard,
  STREAK_LOOKBACK_DAYS,
  type HomeDashboardData,
  type HomeDashboardDependencies,
} from './hooks/useHomeDashboard';

export { ActivePlanCard, type ActivePlanCardProps } from './components/ActivePlanCard';
export { LastWorkoutCard, type LastWorkoutCardProps } from './components/LastWorkoutCard';
export { StreakCard, type StreakCardProps } from './components/StreakCard';
export { LatestPRCard, type LatestPRCardProps } from './components/LatestPRCard';
export { WeeklySummaryCard, type WeeklySummaryCardProps } from './components/WeeklySummaryCard';
