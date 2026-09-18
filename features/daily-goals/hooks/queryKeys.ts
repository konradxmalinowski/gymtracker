/**
 * Query key convention, same shape as `features/plans/hooks/queryKeys.ts`:
 * an `all` prefix each mutation invalidates against, plus one entry per
 * distinct read shape. `today` is keyed on `localDate` since
 * `DailyGoalService.listTodaysGoals` returns a different set of goals (and a
 * different `entry` per goal) on a new calendar day - a stale cached
 * "today" from yesterday must not silently keep showing.
 */
export const dailyGoalKeys = {
  all: ['dailyGoals'] as const,
  today: (localDate: string) => ['dailyGoals', 'today', localDate] as const,
  list: ['dailyGoals', 'list'] as const,
  detail: (id: string) => ['dailyGoals', 'detail', id] as const,
  history: (goalId: string, from: string, to: string) =>
    ['dailyGoals', 'history', goalId, from, to] as const,
  /** `DailyGoalsScreen`'s week/month calendar-view read - keyed on the exact `[from, to]` range so a week and a month covering overlapping days never collide in cache. */
  range: (dateFrom: string, dateTo: string) => ['dailyGoals', 'range', dateFrom, dateTo] as const,
};

export const dailyReminderKeys = {
  all: ['dailyReminders'] as const,
  list: ['dailyReminders', 'list'] as const,
  detail: (id: string) => ['dailyReminders', 'detail', id] as const,
  stats: (id: string, from: string, to: string) =>
    ['dailyReminders', 'stats', id, from, to] as const,
  byGoal: (goalId: string) => ['dailyReminders', 'byGoal', goalId] as const,
};
