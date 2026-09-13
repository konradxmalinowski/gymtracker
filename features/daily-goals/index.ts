/**
 * Public barrel for the "daily-goals" feature.
 *
 * This is the ONLY surface other features may import from (ARCHITECTURE.md
 * section 3.1, rule 4 - enforced by the `import/no-restricted-paths` zones in
 * `eslint.config.js`). Reaching into `features/daily-goals/<subfolder>/...`
 * from any other feature is a lint error; import from `@/features/daily-goals`
 * instead.
 *
 * P17 (`docs/ROADMAP.md`): the domain types/constants, the two repository
 * *interfaces* (never `SqliteDailyGoalRepository`/`SqliteDailyReminderRepository`
 * themselves - every existing feature barrel enforces this same
 * "interface only" rule, see `features/body-metrics/index.ts`), and the two
 * services plus their dependency/input types and error classes land here.
 * `daily-goals` is a total leaf per ARCHITECTURE.md section 9.1's module
 * dependency graph - it depends on nothing else in `features/`. `home` is
 * its one documented future dependent (still P17-documentation-only on the
 * `home` side as of this pass - a later frontend-agent pass wires that up
 * through this barrel).
 *
 * Screens/components/hooks are deliberately NOT exported here - matching
 * `body-metrics`'/`plans`'/`workout-logging`'s own precedent of only
 * barrel-exporting a hook once another feature actually needs to consume it.
 * The one addition the frontend pass makes to this rule of thumb is
 * `summarizeTodaysGoals` below: a pure `domain/` function (not a hook), added
 * specifically because `home`'s `TodaysGoalsCard` needs the exact same
 * completed/total reduction `DailyGoalsScreen` computes for its own header -
 * see that function's own doc comment for the full reasoning.
 */

export {
  isWeekdayActive,
  weekdayIndexOf,
  type MondayBasedWeekdayIndex,
} from './domain/weekdayBitmask';
export { isGoalComplete, type GoalType } from './domain/goalCompletion';
export { summarizeTodaysGoals, type TodaysGoalsSummary } from './domain/summarizeTodaysGoals';
export {
  computeRemainingOccurrencesToday,
  type ReminderOccurrenceInput,
  type ReminderType,
} from './domain/reminderOccurrences';
export {
  enumerateLocalDates,
  formatLocalDate,
  parseLocalDate,
  ONE_DAY_MS,
} from './domain/localDate';

export type { DailyGoal, DailyGoalEntry, DailyGoalWithTodayEntry } from './types/DailyGoal';
export type {
  DailyReminder,
  DailyReminderResponse,
  ReminderResponseValue,
  ReminderStats,
} from './types/DailyReminder';

export type {
  CreateDailyGoalInput,
  DailyGoalRepository,
  UpdateDailyGoalPatch,
} from './repository/DailyGoalRepository';
export type {
  CreateDailyReminderInput,
  DailyReminderRepository,
  UpdateDailyReminderPatch,
} from './repository/DailyReminderRepository';

export {
  DailyGoalService,
  DAILY_GOAL_NAME_MAX_LENGTH,
  DAILY_GOAL_ICON_MAX_LENGTH,
  DAILY_GOAL_UNIT_MAX_LENGTH,
  type DailyGoalServiceDependencies,
} from './services/DailyGoalService';
export {
  DailyReminderService,
  DAILY_REMINDER_NAME_MAX_LENGTH,
  DAILY_REMINDER_ICON_MAX_LENGTH,
  type DailyReminderServiceDependencies,
} from './services/DailyReminderService';

export { DailyGoalValidationError, DailyReminderValidationError } from './services/errors';
