import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { router } from 'expo-router';

import { Column, Row, Screen } from '@/components/layout';
import { IconButton, SegmentedControl, Text } from '@/components/ui';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback';
import { t } from '@/i18n';
import { routes } from '@/navigation/routes';
import { useContainer } from '@/services/container';
import { color, space } from '@/theme/tokens';

import { CalendarDateHeader } from '../components/CalendarDateHeader';
import { MonthGoalCalendar } from '../components/MonthGoalCalendar';
import { TodayGoalRow } from '../components/TodayGoalRow';
import { WeekGoalGrid } from '../components/WeekGoalGrid';
import {
  addDays,
  addMonths,
  endOfWeek,
  monthGridEnd,
  monthGridStart,
  startOfWeek,
  type DailyGoalsViewMode,
} from '../components/calendarDateMath';
import {
  useAllGoals,
  useDailyGoalsForRange,
  useRecordGoalProgress,
  useTodaysGoals,
} from '../hooks/useDailyGoals';
import type { DailyGoalWithTodayEntry } from '../types/DailyGoal';

/**
 * `app/(tabs)/goals/index.tsx`'s screen body - a Google-Calendar-style
 * Day/Week/Month view over daily goals (this pass's own brief). Day view is
 * this screen's original P17 shape (today's active goals, each updatable
 * with no navigation) generalized to any `selectedDate`, not just today's;
 * Week/Month are new, read-only overviews (`WeekGoalGrid`/
 * `MonthGoalCalendar`) - recording progress still only happens from Day
 * view, the same single-source-of-truth-for-writes shape
 * `GoalProgressEntryScreen` already establishes for numeric goals.
 *
 * All three views share one `selectedDate`/`viewMode` pair of state:
 * switching views keeps whatever date/week/month you were already looking
 * at (e.g. picking a day in Month view and switching to Day view lands on
 * that exact day), rather than resetting back to today on every switch.
 *
 * `useTodaysGoals`/`useDailyGoalsForRange` are both called unconditionally
 * (rules of hooks) regardless of `viewMode` - `useDailyGoalsForRange`'s own
 * `enabled` flag just skips the actual fetch for whichever range isn't the
 * currently displayed view.
 *
 * Toggling a `boolean` goal back to incomplete is deliberately supported
 * (`onToggleBoolean` sets `progressValue` to `0`, not just `1`) - a habit
 * tracker's whole premise is that a day's completion state is a live,
 * correctable thing, not a one-way ratchet; the same reasoning now extends
 * to logging progress against a past or future `selectedDate` at all (Day
 * view no longer hardcodes `today`) - backfilling or getting a head start on
 * a scheduled day is a real, intended habit-tracker use case, not a bug.
 */
export function DailyGoalsScreen() {
  const { clock } = useContainer();
  const today = clock.localDate();

  const [viewMode, setViewMode] = useState<DailyGoalsViewMode>('day');
  const [selectedDate, setSelectedDate] = useState(today);

  const viewModeOptions: { value: DailyGoalsViewMode; label: string }[] = [
    { value: 'day', label: t('dailyGoals.today.calendar.viewDayLabel') },
    { value: 'week', label: t('dailyGoals.today.calendar.viewWeekLabel') },
    { value: 'month', label: t('dailyGoals.today.calendar.viewMonthLabel') },
  ];

  const allGoals = useAllGoals();
  const hasAnyGoals = (allGoals.data?.length ?? 0) > 0;
  const recordProgress = useRecordGoalProgress();

  const dayQuery = useTodaysGoals(selectedDate);

  const weekStart = startOfWeek(selectedDate);
  const weekEnd = endOfWeek(selectedDate);
  const weekQuery = useDailyGoalsForRange(weekStart, weekEnd, viewMode === 'week');

  const monthRangeStart = monthGridStart(selectedDate);
  const monthRangeEnd = monthGridEnd(selectedDate);
  const monthQuery = useDailyGoalsForRange(monthRangeStart, monthRangeEnd, viewMode === 'month');

  const showLoading =
    allGoals.isPending ||
    (viewMode === 'day' && dayQuery.isPending) ||
    (viewMode === 'week' && weekQuery.isPending) ||
    (viewMode === 'month' && monthQuery.isPending);

  useEffect(() => {
    if (showLoading) {
      AccessibilityInfo.announceForAccessibility(t('common.loading'));
    }
  }, [showLoading]);

  useEffect(() => {
    if (showLoading || viewMode !== 'day' || dayQuery.isError || !dayQuery.data) {
      return;
    }
    if (dayQuery.data.length === 0) {
      AccessibilityInfo.announceForAccessibility(
        t(
          !hasAnyGoals
            ? 'dailyGoals.today.emptyNoGoalsTitle'
            : selectedDate === today
              ? 'dailyGoals.today.emptyNoneTodayTitle'
              : 'dailyGoals.today.calendar.emptyNoneOnDateTitle',
        ),
      );
    }
  }, [showLoading, viewMode, dayQuery.isError, dayQuery.data, hasAnyGoals, selectedDate, today]);

  function handlePrevious() {
    setSelectedDate((current) => {
      if (viewMode === 'month') return addMonths(current, -1);
      if (viewMode === 'week') return addDays(current, -7);
      return addDays(current, -1);
    });
  }

  function handleNext() {
    setSelectedDate((current) => {
      if (viewMode === 'month') return addMonths(current, 1);
      if (viewMode === 'week') return addDays(current, 7);
      return addDays(current, 1);
    });
  }

  function handleToday() {
    setSelectedDate(today);
  }

  function handleSelectDateFromMonth(localDate: string) {
    setSelectedDate(localDate);
    setViewMode('day');
  }

  function isRowMutating(goalId: string): boolean {
    return recordProgress.isPending && recordProgress.variables?.goalId === goalId;
  }

  function handleToggleBoolean(item: DailyGoalWithTodayEntry) {
    const isComplete = (item.entry?.progressValue ?? 0) >= 1;
    recordProgress.mutate({
      goalId: item.goal.id,
      localDate: selectedDate,
      progressValue: isComplete ? 0 : 1,
    });
  }

  function handleIncrement(item: DailyGoalWithTodayEntry) {
    const next = (item.entry?.progressValue ?? 0) + 1;
    recordProgress.mutate({ goalId: item.goal.id, localDate: selectedDate, progressValue: next });
  }

  function handleDecrement(item: DailyGoalWithTodayEntry) {
    const next = Math.max(0, (item.entry?.progressValue ?? 0) - 1);
    recordProgress.mutate({ goalId: item.goal.id, localDate: selectedDate, progressValue: next });
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

        <SegmentedControl
          options={viewModeOptions}
          value={viewMode}
          onChange={setViewMode}
          testID="daily-goals-view-switcher"
        />

        <CalendarDateHeader
          viewMode={viewMode}
          selectedDate={selectedDate}
          today={today}
          onPrevious={handlePrevious}
          onNext={handleNext}
          onToday={handleToday}
          testID="daily-goals-date-header"
        />

        {showLoading ? (
          <DailyGoalsSkeleton />
        ) : viewMode === 'day' ? (
          <DayView
            data={dayQuery.data}
            isError={dayQuery.isError}
            onRetry={() => dayQuery.refetch()}
            hasAnyGoals={hasAnyGoals}
            isOnToday={selectedDate === today}
            isRowMutating={isRowMutating}
            onToggleBoolean={handleToggleBoolean}
            onIncrement={handleIncrement}
            onDecrement={handleDecrement}
          />
        ) : viewMode === 'week' ? (
          <RangeView
            data={weekQuery.data}
            isError={weekQuery.isError}
            onRetry={() => weekQuery.refetch()}
            hasAnyGoals={hasAnyGoals}
          >
            {(entries) => (
              <WeekGoalGrid
                weekStart={weekStart}
                entries={entries}
                today={today}
                testID="daily-goals-week-grid"
              />
            )}
          </RangeView>
        ) : (
          <RangeView
            data={monthQuery.data}
            isError={monthQuery.isError}
            onRetry={() => monthQuery.refetch()}
            hasAnyGoals={hasAnyGoals}
          >
            {(entries) => (
              <MonthGoalCalendar
                month={selectedDate}
                entries={entries}
                today={today}
                onSelectDate={handleSelectDateFromMonth}
                testID="daily-goals-month-calendar"
              />
            )}
          </RangeView>
        )}
      </Column>
    </Screen>
  );
}

function DayView({
  data,
  isError,
  onRetry,
  hasAnyGoals,
  isOnToday,
  isRowMutating,
  onToggleBoolean,
  onIncrement,
  onDecrement,
}: {
  data: DailyGoalWithTodayEntry[] | undefined;
  isError: boolean;
  onRetry: () => void;
  hasAnyGoals: boolean;
  isOnToday: boolean;
  isRowMutating: (goalId: string) => boolean;
  onToggleBoolean: (item: DailyGoalWithTodayEntry) => void;
  onIncrement: (item: DailyGoalWithTodayEntry) => void;
  onDecrement: (item: DailyGoalWithTodayEntry) => void;
}) {
  if (isError || !data) {
    return <ErrorState error={t('dailyGoals.today.loadErrorMessage')} onRetry={onRetry} />;
  }

  if (data.length === 0) {
    if (!hasAnyGoals) {
      return (
        <EmptyState
          illustration={<Ionicons name="flag-outline" size={48} color={color.textTertiary} />}
          title={t('dailyGoals.today.emptyNoGoalsTitle')}
          message={t('dailyGoals.today.emptyNoGoalsMessage')}
          actionLabel={t('dailyGoals.today.emptyNoGoalsActionLabel')}
          onAction={() => router.push(routes.goals.manage())}
          testID="daily-goals-empty-no-goals"
        />
      );
    }
    return (
      <EmptyState
        illustration={<Ionicons name="calendar-outline" size={48} color={color.textTertiary} />}
        title={t(
          isOnToday
            ? 'dailyGoals.today.emptyNoneTodayTitle'
            : 'dailyGoals.today.calendar.emptyNoneOnDateTitle',
        )}
        message={t(
          isOnToday
            ? 'dailyGoals.today.emptyNoneTodayMessage'
            : 'dailyGoals.today.calendar.emptyNoneOnDateMessage',
        )}
        testID="daily-goals-empty-none-today"
      />
    );
  }

  return (
    <Column gap={3}>
      {data.map((item) => (
        <TodayGoalRow
          key={item.goal.id}
          goalWithEntry={item}
          onToggleBoolean={() => onToggleBoolean(item)}
          onIncrement={() => onIncrement(item)}
          onDecrement={() => onDecrement(item)}
          onAddNumeric={() => router.push(routes.modals.goalProgressEntry(item.goal.id))}
          isMutating={isRowMutating(item.goal.id)}
          testID={`daily-goal-row-${item.goal.id}`}
        />
      ))}
    </Column>
  );
}

function RangeView<T>({
  data,
  isError,
  onRetry,
  hasAnyGoals,
  children,
}: {
  data: T[] | undefined;
  isError: boolean;
  onRetry: () => void;
  hasAnyGoals: boolean;
  children: (entries: T[]) => ReactNode;
}) {
  if (isError || !data) {
    return <ErrorState error={t('dailyGoals.today.loadErrorMessage')} onRetry={onRetry} />;
  }

  if (data.length === 0) {
    return hasAnyGoals ? (
      <EmptyState
        illustration={<Ionicons name="calendar-outline" size={48} color={color.textTertiary} />}
        title={t('dailyGoals.today.calendar.emptyNoneInRangeTitle')}
        message={t('dailyGoals.today.calendar.emptyNoneInRangeMessage')}
        testID="daily-goals-empty-none-in-range"
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
    );
  }

  return <>{children(data)}</>;
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
