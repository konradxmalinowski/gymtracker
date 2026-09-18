import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';

import { Row } from '@/components/layout';
import { IconButton, Text } from '@/components/ui';
import { PressScale } from '@/components/gestures/PressScale';
import { t, type TranslationKey } from '@/i18n';
import { color, space } from '@/theme/tokens';

import { endOfWeek, startOfWeek, type DailyGoalsViewMode } from './calendarDateMath';
import { parseLocalDate } from '../domain/localDate';

export interface CalendarDateHeaderProps {
  viewMode: DailyGoalsViewMode;
  selectedDate: string;
  today: string;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  testID?: string | undefined;
}

const PREVIOUS_LABEL_KEY: Record<DailyGoalsViewMode, TranslationKey> = {
  day: 'dailyGoals.today.calendar.previousDayAccessibilityLabel',
  week: 'dailyGoals.today.calendar.previousWeekAccessibilityLabel',
  month: 'dailyGoals.today.calendar.previousMonthAccessibilityLabel',
};

const NEXT_LABEL_KEY: Record<DailyGoalsViewMode, TranslationKey> = {
  day: 'dailyGoals.today.calendar.nextDayAccessibilityLabel',
  week: 'dailyGoals.today.calendar.nextWeekAccessibilityLabel',
  month: 'dailyGoals.today.calendar.nextMonthAccessibilityLabel',
};

/**
 * `DailyGoalsScreen`'s lightweight day-picker header - back/forward arrows
 * around a `viewMode`-appropriate date label, plus a "Today" quick-jump that
 * only appears once the selected day/week/month has actually been navigated
 * away from (mirrors `CalendarScreen`'s own "don't show a no-op control"
 * judgment). Deliberately not a full calendar-picker widget - the brief for
 * this pass only calls for previous/next navigation here; `MonthGoalCalendar`
 * is this screen's actual date-picking surface.
 */
export function CalendarDateHeader({
  viewMode,
  selectedDate,
  today,
  onPrevious,
  onNext,
  onToday,
  testID,
}: CalendarDateHeaderProps) {
  const label = formatHeaderLabel(viewMode, selectedDate);
  const isOnCurrentPeriod = isSameCalendarPeriod(viewMode, selectedDate, today);

  return (
    <View testID={testID}>
      <Row justify="space-between" align="center">
        <IconButton
          icon={<Ionicons name="chevron-back" size={18} color={color.textPrimary} />}
          variant="ghost"
          size="sm"
          accessibilityLabel={t(PREVIOUS_LABEL_KEY[viewMode])}
          onPress={onPrevious}
          testID={testID ? `${testID}-previous` : undefined}
        />
        <Row gap={2} align="center">
          <Text variant="callout" color="primary">
            {label}
          </Text>
          {!isOnCurrentPeriod ? (
            <PressScale
              onPress={onToday}
              accessibilityRole="button"
              accessibilityLabel={t('dailyGoals.today.calendar.todayButtonLabel')}
              style={{ paddingHorizontal: space[1] }}
              testID={testID ? `${testID}-today` : undefined}
            >
              <Text variant="footnote" color="accent">
                {t('dailyGoals.today.calendar.todayButtonLabel')}
              </Text>
            </PressScale>
          ) : null}
        </Row>
        <IconButton
          icon={<Ionicons name="chevron-forward" size={18} color={color.textPrimary} />}
          variant="ghost"
          size="sm"
          accessibilityLabel={t(NEXT_LABEL_KEY[viewMode])}
          onPress={onNext}
          testID={testID ? `${testID}-next` : undefined}
        />
      </Row>
    </View>
  );
}

function isSameCalendarPeriod(
  viewMode: DailyGoalsViewMode,
  selectedDate: string,
  today: string,
): boolean {
  if (viewMode === 'month') {
    return selectedDate.slice(0, 7) === today.slice(0, 7);
  }
  if (viewMode === 'week') {
    return startOfWeek(selectedDate) === startOfWeek(today);
  }
  return selectedDate === today;
}

/**
 * `Intl.DateTimeFormat` directly, matching `CalendarScreen.tsx`'s/
 * `CalendarDayCell.tsx`'s own English-only-v1 (D-11) date-formatting
 * convention rather than a translation-catalog template for a pure date
 * format. A plain hyphen (not an en/em dash) separates the week range's two
 * endpoints, matching this codebase's own prose style everywhere else.
 */
function formatHeaderLabel(viewMode: DailyGoalsViewMode, selectedDate: string): string {
  if (viewMode === 'day') {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(parseLocalDate(selectedDate));
  }
  if (viewMode === 'week') {
    const start = startOfWeek(selectedDate);
    const end = endOfWeek(selectedDate);
    const startLabel = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    }).format(parseLocalDate(start));
    const endLabel = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(parseLocalDate(end));
    return `${startLabel} - ${endLabel}`;
  }
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
    parseLocalDate(selectedDate),
  );
}
