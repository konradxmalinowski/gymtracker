import { View } from 'react-native';

import { PressScale } from '@/components/gestures/PressScale';
import { Text } from '@/components/ui';
import { t, type TranslationKey } from '@/i18n';
import { color, radius, space } from '@/theme/tokens';

import { addDays, monthGridStart } from './calendarDateMath';
import { isGoalComplete } from '../domain/goalCompletion';
import { parseLocalDate } from '../domain/localDate';
import type { DailyGoalRangeEntry } from '../hooks/useDailyGoals';

const WEEKDAY_LABEL_KEYS: readonly TranslationKey[] = [
  'dailyGoals.weekday.mon',
  'dailyGoals.weekday.tue',
  'dailyGoals.weekday.wed',
  'dailyGoals.weekday.thu',
  'dailyGoals.weekday.fri',
  'dailyGoals.weekday.sat',
  'dailyGoals.weekday.sun',
];

interface DaySummary {
  total: number;
  completed: number;
}

export interface MonthGoalCalendarProps {
  /** Any local date within the displayed month (`DailyGoalsScreen`'s own `selectedDate`) - the grid renders that whole month, plus enough leading/trailing days from adjacent months to fill full weeks. */
  month: string;
  /** `useDailyGoalsForRange(monthGridStart(month), monthGridEnd(month))`'s own flat result. */
  entries: readonly DailyGoalRangeEntry[];
  today: string;
  /** Fired when a day cell is tapped - `DailyGoalsScreen` switches to day view on that date, mirroring `CalendarScreen`'s own "tap a day to drill in" affordance. */
  onSelectDate: (localDate: string) => void;
  testID?: string | undefined;
}

/**
 * A lightweight, glanceable calendar grid - each day cell shows one of four
 * completion states (no goals scheduled / none done / some done / all done)
 * rather than every individual goal, which would not fit 30+ cells at phone
 * width. Structurally mirrors `features/calendar/components/CalendarMonth.tsx`
 * (percentage-width `flexWrap` grid, one collapsed `accessible` weekday
 * header row per that file's own accessibility-review precedent) - not
 * imported from there, since `daily-goals` is a total leaf
 * (`ARCHITECTURE.md` section 9.1) and `calendar`'s own grid is scoped to
 * session/volume data this feature has no reason to depend on.
 */
export function MonthGoalCalendar({
  month,
  entries,
  today,
  onSelectDate,
  testID,
}: MonthGoalCalendarProps) {
  const gridStart = monthGridStart(month);
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  const currentMonthPrefix = month.slice(0, 7);
  const summaryByDate = buildDaySummaries(entries);

  return (
    <View testID={testID}>
      <View
        accessible
        accessibilityLabel={t('dailyGoals.today.calendar.weekdayHeaderAccessibilityLabel')}
        style={{ flexDirection: 'row', marginBottom: space[1] }}
      >
        {WEEKDAY_LABEL_KEYS.map((key) => (
          <View key={key} style={{ width: `${100 / 7}%`, alignItems: 'center' }}>
            <Text variant="caption" color="tertiary">
              {t(key)}
            </Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {days.map((day) => (
          <View key={day} style={{ width: `${100 / 7}%`, padding: space['0.5'] }}>
            <MonthDayCell
              localDate={day}
              isCurrentMonth={day.slice(0, 7) === currentMonthPrefix}
              isToday={day === today}
              summary={summaryByDate.get(day) ?? null}
              onPress={() => onSelectDate(day)}
              testID={testID ? `${testID}-day-${day}` : undefined}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

function MonthDayCell({
  localDate,
  isCurrentMonth,
  isToday,
  summary,
  onPress,
  testID,
}: {
  localDate: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  summary: DaySummary | null;
  onPress: () => void;
  testID?: string | undefined;
}) {
  const dayNumber = Number(localDate.slice(8, 10));
  const state = resolveDayState(summary);
  const accessibilityLabel = buildMonthDayAccessibilityLabel(localDate, summary);

  const isFilled = state === 'allDone';
  const isOutlined = state === 'someDone' || state === 'noneDone';

  return (
    <View
      style={{
        flex: 1,
        aspectRatio: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: space['0.5'],
        opacity: isCurrentMonth ? 1 : 0.35,
      }}
    >
      <PressScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        testID={testID}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: radius.full,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isFilled ? color.accent : 'transparent',
            borderWidth: isOutlined ? 1 : 0,
            borderColor: state === 'someDone' ? color.accent : color.border,
          }}
        >
          <Text variant="footnote" color={isFilled ? 'inverse' : 'primary'}>
            {dayNumber}
          </Text>
        </View>
      </PressScale>
      <View
        style={{
          width: 4,
          height: 4,
          borderRadius: radius.full,
          backgroundColor: isToday ? color.accent : 'transparent',
        }}
      />
    </View>
  );
}

type DayState = 'noGoals' | 'noneDone' | 'someDone' | 'allDone';

function resolveDayState(summary: DaySummary | null): DayState {
  if (!summary || summary.total === 0) {
    return 'noGoals';
  }
  if (summary.completed === summary.total) {
    return 'allDone';
  }
  if (summary.completed === 0) {
    return 'noneDone';
  }
  return 'someDone';
}

function buildDaySummaries(entries: readonly DailyGoalRangeEntry[]): Map<string, DaySummary> {
  const summaryByDate = new Map<string, DaySummary>();
  for (const entry of entries) {
    const summary = summaryByDate.get(entry.localDate) ?? { total: 0, completed: 0 };
    summary.total += 1;
    const progressValue = entry.entry?.progressValue ?? 0;
    if (isGoalComplete(entry.goal.goalType, entry.goal.targetValue, progressValue)) {
      summary.completed += 1;
    }
    summaryByDate.set(entry.localDate, summary);
  }
  return summaryByDate;
}

/** A real, data-summarizing label per day - mirrors `CalendarDayCell.tsx`'s own `buildCalendarDayAccessibilityLabel` precedent rather than a bare "day 12" structural label. */
function buildMonthDayAccessibilityLabel(localDate: string, summary: DaySummary | null): string {
  const dateLabel = formatMonthDayAccessibilityDate(localDate);
  const state = resolveDayState(summary);

  if (state === 'noGoals') {
    return t('dailyGoals.today.calendar.monthDayNoGoalsAccessibilityLabelTemplate', {
      date: dateLabel,
    });
  }
  if (state === 'allDone') {
    return t('dailyGoals.today.calendar.monthDayAllDoneAccessibilityLabelTemplate', {
      date: dateLabel,
    });
  }
  if (state === 'noneDone') {
    return t('dailyGoals.today.calendar.monthDayNoneDoneAccessibilityLabelTemplate', {
      date: dateLabel,
    });
  }
  return t('dailyGoals.today.calendar.monthDaySomeDoneAccessibilityLabelTemplate', {
    date: dateLabel,
    completed: summary!.completed,
    total: summary!.total,
  });
}

/** "August 12, 2026" - `Intl.DateTimeFormat` directly, matching `CalendarDayCell.tsx`'s own English-only-v1 (D-11) date-formatting convention. */
function formatMonthDayAccessibilityDate(localDate: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(parseLocalDate(localDate));
}
