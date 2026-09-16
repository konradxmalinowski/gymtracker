import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';
import { router } from 'expo-router';

import { Column, Row, Screen } from '@/components/layout';
import { IconButton, Text } from '@/components/ui';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback';
import { t } from '@/i18n';
import { routes } from '@/navigation/routes';
import { useContainer } from '@/services/container';
import { color, space } from '@/theme/tokens';

import { TodayGoalRow } from '../components/TodayGoalRow';
import { useAllGoals, useRecordGoalProgress, useTodaysGoals } from '../hooks/useDailyGoals';
import type { DailyGoalWithTodayEntry } from '../types/DailyGoal';

/**
 * `app/(tabs)/goals/index.tsx`'s screen body - the daily view (`docs/ROADMAP.md`
 * P17's own acceptance line: "today's active goals, each updatable with no
 * navigation"). `useTodaysGoals` already filters to enabled goals active on
 * today's weekday; `useAllGoals` is fetched alongside purely to distinguish
 * this screen's two distinct empty states - "you have never configured a
 * goal at all" (routes into `goals/manage`) versus "you have goals, just
 * none scheduled today" (no action, just different copy) - the same
 * "real, distinct empty states, never a shared generic one" rule this
 * codebase's other dashboard-shaped screens (`HomeScreen`'s per-card empty
 * states) already follow.
 *
 * Toggling a `boolean` goal back to incomplete is deliberately supported
 * (`onToggleBoolean` sets `progressValue` to `0`, not just `1`) - a habit
 * tracker's whole premise is that a day's completion state is a live,
 * correctable thing up until the day ends, not a one-way ratchet; the same
 * reasoning applies uniformly to the `Checkbox` primitive already using this
 * pattern everywhere else (`SetRow`'s own completion checkbox is one-way
 * only for a different reason - a completed *set* is a historical record -
 * so this is a deliberate distinction, not an accidental inconsistency).
 */
export function DailyGoalsScreen() {
  const { clock } = useContainer();
  const today = clock.localDate();
  const { data, isPending, isError, refetch } = useTodaysGoals(today);
  const allGoals = useAllGoals();
  const recordProgress = useRecordGoalProgress();

  const showLoading = isPending || allGoals.isPending;

  useEffect(() => {
    if (showLoading) {
      AccessibilityInfo.announceForAccessibility(t('common.loading'));
    }
  }, [showLoading]);

  useEffect(() => {
    if (!showLoading && !isError && data && data.length === 0) {
      const hasAnyGoals = (allGoals.data?.length ?? 0) > 0;
      AccessibilityInfo.announceForAccessibility(
        t(
          hasAnyGoals
            ? 'dailyGoals.today.emptyNoneTodayTitle'
            : 'dailyGoals.today.emptyNoGoalsTitle',
        ),
      );
    }
  }, [showLoading, isError, data, allGoals.data]);

  function isRowMutating(goalId: string): boolean {
    return recordProgress.isPending && recordProgress.variables?.goalId === goalId;
  }

  function handleToggleBoolean(item: DailyGoalWithTodayEntry) {
    const isComplete = (item.entry?.progressValue ?? 0) >= 1;
    recordProgress.mutate({
      goalId: item.goal.id,
      localDate: today,
      progressValue: isComplete ? 0 : 1,
    });
  }

  function handleIncrement(item: DailyGoalWithTodayEntry) {
    const next = (item.entry?.progressValue ?? 0) + 1;
    recordProgress.mutate({ goalId: item.goal.id, localDate: today, progressValue: next });
  }

  function handleDecrement(item: DailyGoalWithTodayEntry) {
    const next = Math.max(0, (item.entry?.progressValue ?? 0) - 1);
    recordProgress.mutate({ goalId: item.goal.id, localDate: today, progressValue: next });
  }

  return (
    <Screen testID="daily-goals-screen" scroll edges={['bottom']}>
      <Column gap={4} style={{ paddingVertical: space[4] }}>
        <Row justify="space-between" align="center">
          <Text variant="title2" color="primary">
            {t('dailyGoals.today.screenTitle')}
          </Text>
          <IconButton
            icon={<Ionicons name="settings-outline" size={20} color={color.textSecondary} />}
            variant="ghost"
            size="sm"
            accessibilityLabel={t('dailyGoals.today.manageAccessibilityLabel')}
            onPress={() => router.push(routes.goals.manage())}
            testID="daily-goals-manage-button"
          />
        </Row>

        {showLoading ? (
          <DailyGoalsSkeleton />
        ) : isError || !data ? (
          <ErrorState error={t('dailyGoals.today.loadErrorMessage')} onRetry={() => refetch()} />
        ) : data.length === 0 ? (
          (allGoals.data?.length ?? 0) > 0 ? (
            <EmptyState
              illustration={
                <Ionicons name="calendar-outline" size={48} color={color.textTertiary} />
              }
              title={t('dailyGoals.today.emptyNoneTodayTitle')}
              message={t('dailyGoals.today.emptyNoneTodayMessage')}
              testID="daily-goals-empty-none-today"
            />
          ) : (
            <EmptyState
              illustration={<Ionicons name="flag-outline" size={48} color={color.textTertiary} />}
              title={t('dailyGoals.today.emptyNoGoalsTitle')}
              message={t('dailyGoals.today.emptyNoGoalsMessage')}
              actionLabel={t('dailyGoals.today.emptyNoGoalsActionLabel')}
              onAction={() => router.push(routes.goals.manage())}
              testID="daily-goals-empty-no-goals"
            />
          )
        ) : (
          <Column gap={3}>
            {data.map((item) => (
              <TodayGoalRow
                key={item.goal.id}
                goalWithEntry={item}
                onToggleBoolean={() => handleToggleBoolean(item)}
                onIncrement={() => handleIncrement(item)}
                onDecrement={() => handleDecrement(item)}
                onAddNumeric={() => router.push(routes.modals.goalProgressEntry(item.goal.id))}
                isMutating={isRowMutating(item.goal.id)}
                testID={`daily-goal-row-${item.goal.id}`}
              />
            ))}
          </Column>
        )}
      </Column>
    </Screen>
  );
}

function DailyGoalsSkeleton() {
  return (
    <Column gap={3}>
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} width="100%" height={72} radius="xl" />
      ))}
    </Column>
  );
}
