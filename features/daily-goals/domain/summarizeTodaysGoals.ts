/**
 * Pure summarizer over `DailyGoalWithTodayEntry[]` (`DailyGoalService.listTodaysGoals`'s
 * own return shape) - `{ completed, total }` for "N of M goals done today."
 *
 * Lives in `domain/` (no React/RN/Expo import - domain purity, ARCHITECTURE.md
 * section 3.1 rule 1) and is barrel-exported specifically so `home`'s
 * `TodaysGoalsCard` can share it rather than re-deriving the same
 * `isGoalComplete` reduction a second time. This is the frontend pass's
 * resolution of the "how does Home's summary card get its data" open
 * question from this feature's own brief: `useHomeDashboard.ts` calls
 * `dailyGoalService.listTodaysGoals(today)` directly (a plain service call,
 * the same shape `recordService.listRecent(1)` already has in that hook -
 * see its own header comment) rather than adding a new barrel-exported hook,
 * and `TodaysGoalsCard` reduces the raw list with this function. No new
 * hook was needed since `listTodaysGoals` is already a plain async method
 * with nothing to validate on the read side.
 */
import { isGoalComplete } from './goalCompletion';
import type { DailyGoalWithTodayEntry } from '../types/DailyGoal';

export interface TodaysGoalsSummary {
  completed: number;
  total: number;
}

export function summarizeTodaysGoals(
  goals: readonly DailyGoalWithTodayEntry[],
): TodaysGoalsSummary {
  const total = goals.length;
  const completed = goals.filter(({ goal, entry }) =>
    isGoalComplete(goal.goalType, goal.targetValue, entry?.progressValue ?? 0),
  ).length;
  return { completed, total };
}
