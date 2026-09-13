import type { QueryClient } from '@tanstack/react-query';

import { dailyGoalKeys, dailyReminderKeys } from './queryKeys';

/**
 * Centralized invalidation, mirroring `features/plans/hooks/invalidation.ts`'s
 * own precedent and doc-comment shape. Every goal mutation invalidates
 * `dailyGoalKeys.all` plus `['home','dashboard']` - Home's `TodaysGoalsCard`
 * reads `dailyGoalService.listTodaysGoals` directly inside
 * `useHomeDashboard`'s own query function (see `summarizeTodaysGoals.ts`'s
 * doc comment for why that card has no dedicated hook of its own), so a goal
 * create/edit/delete/enable/progress write needs to invalidate that
 * dashboard query too, the same way `invalidatePlanQueries` already does for
 * plan mutations.
 */
export function invalidateDailyGoalQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: dailyGoalKeys.all });
  void queryClient.invalidateQueries({ queryKey: ['home', 'dashboard'] });
}

/**
 * Reminders never feed Home's dashboard (only goals do), so this only ever
 * touches `dailyReminderKeys.all` - no `['home','dashboard']` companion
 * invalidation the way {@link invalidateDailyGoalQueries} needs.
 */
export function invalidateDailyReminderQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: dailyReminderKeys.all });
}
