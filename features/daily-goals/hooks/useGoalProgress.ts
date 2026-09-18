import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { ONE_DAY_MS, formatLocalDate } from '@/features/daily-goals';
import type { EntityId } from '@/repositories/contracts/repository';
import { useContainer } from '@/services/container';

import { dailyGoalKeys } from './queryKeys';

/** `GoalProgressChartCard`'s own window - 30 calendar days, inclusive of today, matching every other chart in this app's "recent trend" default rather than an unbounded read. */
const PROGRESS_WINDOW_DAYS = 30;

export interface GoalProgressWindow {
  from: string;
  to: string;
}

/** Exported for `GoalProgressChartCard` to enumerate the same bounds it renders against, without re-deriving "today" a second time. */
export function goalProgressWindow(referenceEpochMs: number = Date.now()): GoalProgressWindow {
  const to = formatLocalDate(referenceEpochMs);
  const from = formatLocalDate(referenceEpochMs - (PROGRESS_WINDOW_DAYS - 1) * ONE_DAY_MS);
  return { from, to };
}

/**
 * `GoalFormScreen`'s edit-mode progress-chart read. `DailyGoalService
 * .getEntryHistory` already existed (a thin wrapper over `DailyGoalRepository
 * .listEntryHistory`, `database/schema.sql` section 7.12) but nothing called
 * it until now - the same "already existed, just needed a hook" shape as
 * `useDailyReminders.ts`'s own `useRemindersForGoal`.
 *
 * A dedicated file rather than an addition to `useDailyGoals.ts` - kept
 * disjoint from a parallel pass editing that file. `goalId` may be
 * `undefined` while `GoalFormScreen`'s create mode has no id yet (this
 * screen's progress section is edit-mode-only per its own "only when editing
 * an existing goal" condition, but the hook itself stays defensive the same
 * way `useRemindersForGoal` does).
 */
export function useGoalProgress(goalId: EntityId | undefined) {
  const { dailyGoalService } = useContainer();
  // Computed once per mount rather than on every render - the 30-day window
  // only needs to be "today, roughly," not resynced mid-session the way a
  // live dashboard clock would.
  const { from, to } = useMemo(() => goalProgressWindow(), []);

  const query = useQuery({
    queryKey: dailyGoalKeys.history(goalId ?? '', from, to),
    queryFn: () => dailyGoalService.getEntryHistory(goalId as EntityId, from, to),
    enabled: Boolean(goalId),
  });

  return { ...query, from, to };
}
