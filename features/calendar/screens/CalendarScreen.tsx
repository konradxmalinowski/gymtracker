import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { router } from 'expo-router';

import { Column, Row, Screen } from '@/components/layout';
import { IconButton, SegmentedControl, Text } from '@/components/ui';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback';
import { t } from '@/i18n';
import { routes } from '@/navigation/routes';
import { useContainer } from '@/services/container';
import { useSheetStore } from '@/stores/sheetStore';
import { color, space } from '@/theme/tokens';

import { CalendarDaySessionPicker } from '../components/CalendarDaySessionPicker';
import { CalendarLegend } from '../components/CalendarLegend';
import { CalendarMonth } from '../components/CalendarMonth';
import { CalendarYearHeatmapCard } from '../components/CalendarYearHeatmapCard';
import { addMonthsToLocalDate, startOfMonth } from '../domain/localDate';
import { useCalendarMonth, type CalendarMonthDayCell } from '../hooks/useCalendarMonth';
import { useCalendarYear } from '../hooks/useCalendarYear';

type CalendarView = 'month' | 'year';

const DAY_SESSION_PICKER_SHEET_ID = 'calendar-day-sessions';

/**
 * `app/profile/calendar.tsx`'s screen body (CLAUDE.md: "app/ never contains
 * screen bodies"). Resolves `calendarRepository` via `useContainer()` here,
 * not inside `useCalendarMonth`/`useCalendarYear` themselves - see those
 * hooks' own doc comments for the `import/no-cycle` reasoning.
 *
 * Month navigation is plain local component state (`monthAnchor`, a
 * `YYYY-MM-01` string) rather than a route param - this screen has one entry
 * point (`ProfileScreen`'s "Training calendar" row) and nothing deep-links
 * into a specific month today, so there is no state worth round-tripping
 * through the URL yet (unlike `stats.exercise(exerciseId)`, which other
 * screens navigate into directly). The initial anchor is derived from
 * `clock.localDate()`, not a bare `new Date()` - the same injected-`Clock`
 * convention `useStatisticsDashboard`/`useHomeDashboard` both follow, so
 * "today" stays swappable in tests instead of requiring a `Date` monkeypatch.
 *
 * Day-tap behavior (this phase's own acceptance line): exactly one session
 * on that day navigates straight to `routes.history.detail(sessionId)`;
 * more than one opens `CalendarDaySessionPicker` in the shared `SheetHost`.
 * `CalendarDayCell` itself never calls `onDayPress` for an untrained or
 * outside-month cell (`isInteractive` there), so this handler only ever
 * receives a real, trained, current-month cell.
 */
export function CalendarScreen() {
  const { calendarRepository, clock } = useContainer();
  const [view, setView] = useState<CalendarView>('month');
  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(clock.localDate()));

  const year = Number(monthAnchor.slice(0, 4));
  const month = Number(monthAnchor.slice(5, 7));

  const monthQuery = useCalendarMonth(calendarRepository, year, month);
  const yearQuery = useCalendarYear(calendarRepository, year);

  const isPending = view === 'month' ? monthQuery.isPending : yearQuery.isPending;
  const isError = view === 'month' ? monthQuery.isError : yearQuery.isError;

  const isMonthEmpty = useMemo(
    () => !monthQuery.data?.some((cell) => cell.isCurrentMonth && cell.sessionIds.length > 0),
    [monthQuery.data],
  );
  // Same "no trained day" test `CalendarYearHeatmapCard.tsx` runs internally
  // for its own `ChartCard` `isEmpty` prop (`days.every((day) => day.level
  // === 0)`) - duplicated here, not imported, since that component has no
  // reason to expose its empty-ness as a callback and this screen needs to
  // know it before deciding what to announce (A11Y-P12-002, `reports/
  // accessibility-2026-08-19-p12.md`).
  const isYearEmpty = useMemo(
    () => !yearQuery.data?.some((day) => day.level > 0),
    [yearQuery.data],
  );

  useEffect(() => {
    if (isPending) {
      AccessibilityInfo.announceForAccessibility(t('common.loading'));
    } else if (view === 'month' && isMonthEmpty) {
      AccessibilityInfo.announceForAccessibility(t('calendar.month.emptyTitle'));
    } else if (view === 'year' && isYearEmpty) {
      // Reuses `CalendarYearHeatmapCard`'s own `ChartCard` `emptyTitle` copy
      // rather than a new key - same string, same meaning, one screen reader
      // announcement of it is enough.
      AccessibilityInfo.announceForAccessibility(t('calendar.yearHeatmap.emptyTitle'));
    }
  }, [isPending, view, isMonthEmpty, isYearEmpty]);

  function handleDayPress(cell: CalendarMonthDayCell) {
    if (cell.sessionIds.length === 1) {
      router.push(routes.history.detail(cell.sessionIds[0]!));
      return;
    }
    useSheetStore.getState().present({
      id: DAY_SESSION_PICKER_SHEET_ID,
      content: (
        <CalendarDaySessionPicker
          localDate={cell.localDate}
          sessionIds={cell.sessionIds}
          planDayNames={cell.planDayNames}
          testID="calendar-day-session-picker"
        />
      ),
      snapPoints: [0.5],
    });
  }

  return (
    <Screen testID="calendar-screen" scroll>
      <Column gap={4} style={{ paddingVertical: space[4] }}>
        <Text variant="display" color="primary">
          {t('calendar.screenTitle')}
        </Text>

        <SegmentedControl
          options={[
            { value: 'month' as const, label: t('calendar.view.month') },
            { value: 'year' as const, label: t('calendar.view.year') },
          ]}
          value={view}
          onChange={setView}
          testID="calendar-view-selector"
        />

        {isError ? (
          <ErrorState
            error={t('calendar.loadErrorMessage')}
            onRetry={() => (view === 'month' ? monthQuery.refetch() : yearQuery.refetch())}
          />
        ) : view === 'month' ? (
          <Column gap={3}>
            <Row justify="space-between" align="center">
              <IconButton
                icon={<Ionicons name="chevron-back" size={18} color={color.textPrimary} />}
                variant="ghost"
                accessibilityLabel={t('calendar.month.previousAccessibilityLabel')}
                onPress={() => setMonthAnchor((current) => addMonthsToLocalDate(current, -1))}
                testID="calendar-previous-month-button"
              />
              <Text variant="title3" color="primary" accessibilityRole="header">
                {formatMonthTitle(monthAnchor)}
              </Text>
              <IconButton
                icon={<Ionicons name="chevron-forward" size={18} color={color.textPrimary} />}
                variant="ghost"
                accessibilityLabel={t('calendar.month.nextAccessibilityLabel')}
                onPress={() => setMonthAnchor((current) => addMonthsToLocalDate(current, 1))}
                testID="calendar-next-month-button"
              />
            </Row>

            {isPending ? (
              <MonthGridSkeleton />
            ) : (
              <>
                <CalendarMonth
                  cells={monthQuery.data ?? []}
                  onDayPress={handleDayPress}
                  testID="calendar-month-grid"
                />
                <CalendarLegend testID="calendar-legend" />
                {isMonthEmpty ? (
                  <EmptyState
                    illustration={
                      <Ionicons name="calendar-outline" size={32} color={color.textTertiary} />
                    }
                    title={t('calendar.month.emptyTitle')}
                    message={t('calendar.month.emptyMessage')}
                    testID="calendar-month-empty-state"
                  />
                ) : null}
              </>
            )}
          </Column>
        ) : (
          <CalendarYearHeatmapCard
            data={yearQuery.data}
            year={year}
            isPending={yearQuery.isPending}
            testID="calendar-year-heatmap-card"
          />
        )}
      </Column>
    </Screen>
  );
}

/** "August 2026" - `Intl.DateTimeFormat` directly, matching `CalendarDayCell.tsx`'s own English-only-v1 (D-11) date-formatting convention. */
function formatMonthTitle(monthAnchor: string): string {
  const [year, month] = monthAnchor.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
    new Date(Date.UTC(year!, month! - 1, 1)),
  );
}

function MonthGridSkeleton() {
  return (
    <Column gap={2}>
      {[0, 1, 2, 3, 4].map((row) => (
        <Row key={row} gap={2}>
          {[0, 1, 2, 3, 4, 5, 6].map((col) => (
            <Skeleton key={col} width="14%" height={40} radius="full" />
          ))}
        </Row>
      ))}
    </Column>
  );
}
