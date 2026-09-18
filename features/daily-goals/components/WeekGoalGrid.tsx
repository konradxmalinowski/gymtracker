import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';

import { Column, Row } from '@/components/layout';
import { Text } from '@/components/ui';
import { t, type TranslationKey } from '@/i18n';
import { color, radius } from '@/theme/tokens';

import { addDays } from './calendarDateMath';
import { resolveGoalIconName } from './goalIcons';
import { isGoalComplete } from '../domain/goalCompletion';
import type { DailyGoal } from '../types/DailyGoal';
import type { DailyGoalRangeEntry } from '../hooks/useDailyGoals';

const DAY_LABEL_KEYS: readonly TranslationKey[] = [
  'dailyGoals.weekday.mon',
  'dailyGoals.weekday.tue',
  'dailyGoals.weekday.wed',
  'dailyGoals.weekday.thu',
  'dailyGoals.weekday.fri',
  'dailyGoals.weekday.sat',
  'dailyGoals.weekday.sun',
];

const DAY_COLUMN_WIDTH = 32;
const CELL_SIZE = 20;

export interface WeekGoalGridProps {
  /** Monday of the displayed week (`calendarDateMath.startOfWeek`'s own output). */
  weekStart: string;
  /** `useDailyGoalsForRange(weekStart, endOfWeek(weekStart))`'s own flat result. */
  entries: readonly DailyGoalRangeEntry[];
  today: string;
  testID?: string | undefined;
}

/**
 * A habit-tracker-style table: one row per goal active at least one day this
 * week, one column per day (Monday..Sunday) - the "7-column grid" shape the
 * brief calls for, laid out as goal-rows x day-columns rather than
 * day-rows x goal-columns since a goal's name is the variable-width thing
 * here (some fixed-width day cells read far more legibly at phone width than
 * seven variable-width goal lists stacked under seven day headers would).
 * Read-only - week/month views summarize; only `DailyGoalsScreen`'s day view
 * (`TodayGoalRow`) can record progress, per this pass's own brief.
 */
export function WeekGoalGrid({ weekStart, entries, today, testID }: WeekGoalGridProps) {
  const days = buildWeekDays(weekStart);
  const goals = collectDistinctGoalsBySortOrder(entries);
  const entryByCellKey = buildEntryLookup(entries);

  return (
    <View testID={testID}>
      <Column gap={3}>
        <Row gap={2} align="center">
          <View style={{ flex: 1 }} />
          {days.map((day, index) => (
            <View key={day} style={{ width: DAY_COLUMN_WIDTH, alignItems: 'center' }}>
              <Text variant="caption" color={day === today ? 'accent' : 'tertiary'}>
                {t(DAY_LABEL_KEYS[index]!)}
              </Text>
              <Text variant="footnote" color={day === today ? 'accent' : 'secondary'}>
                {Number(day.slice(8, 10))}
              </Text>
            </View>
          ))}
        </Row>

        {goals.map((goal) => (
          <Row key={goal.id} gap={2} align="center">
            <Row gap={1} align="center" style={{ flex: 1 }}>
              <Ionicons name={resolveGoalIconName(goal.icon)} size={16} color={color.accentText} />
              <Text variant="footnote" color="primary" numberOfLines={1} style={{ flex: 1 }}>
                {goal.name}
              </Text>
            </Row>
            {days.map((day, index) => {
              const rangeEntry = entryByCellKey.get(cellKey(goal.id, day));
              const dayLabel = t(DAY_LABEL_KEYS[index]!);
              return (
                <View key={day} style={{ width: DAY_COLUMN_WIDTH, alignItems: 'center' }}>
                  <WeekCell goal={goal} dayLabel={dayLabel} rangeEntry={rangeEntry} />
                </View>
              );
            })}
          </Row>
        ))}
      </Column>
    </View>
  );
}

function WeekCell({
  goal,
  dayLabel,
  rangeEntry,
}: {
  goal: DailyGoal;
  dayLabel: string;
  rangeEntry: DailyGoalRangeEntry | undefined;
}) {
  // No row for this (goal, day) pair means the goal's `active_weekdays`
  // bitmask excludes that day - never rendered as a false "not done"
  // (this pass's own explicit edge case), just a neutral placeholder.
  if (!rangeEntry) {
    return (
      <View
        accessible
        accessibilityLabel={t(
          'dailyGoals.today.calendar.weekCellInactiveAccessibilityLabelTemplate',
          {
            name: goal.name,
            day: dayLabel,
          },
        )}
        style={{
          width: CELL_SIZE,
          height: CELL_SIZE,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text variant="caption" color="tertiary">
          {'-'}
        </Text>
      </View>
    );
  }

  const progressValue = rangeEntry.entry?.progressValue ?? 0;
  const complete = isGoalComplete(goal.goalType, goal.targetValue, progressValue);

  return (
    <View
      accessible
      accessibilityLabel={t(
        complete
          ? 'dailyGoals.today.calendar.weekCellDoneAccessibilityLabelTemplate'
          : 'dailyGoals.today.calendar.weekCellNotDoneAccessibilityLabelTemplate',
        { name: goal.name, day: dayLabel },
      )}
      style={{
        width: CELL_SIZE,
        height: CELL_SIZE,
        borderRadius: radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: complete ? color.accent : 'transparent',
        borderWidth: complete ? 0 : 1,
        borderColor: color.borderStrong,
      }}
    >
      {complete ? <Ionicons name="checkmark" size={12} color={color.textInverse} /> : null}
    </View>
  );
}

function buildWeekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

/** Every distinct goal referenced anywhere in `entries` (i.e. active on at least one day this week), `sort_order ASC` - matches `DailyGoalRepository.listAll`'s own ordering convention. */
function collectDistinctGoalsBySortOrder(entries: readonly DailyGoalRangeEntry[]): DailyGoal[] {
  const byId = new Map<string, DailyGoal>();
  for (const entry of entries) {
    if (!byId.has(entry.goal.id)) {
      byId.set(entry.goal.id, entry.goal);
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.sortOrder - b.sortOrder);
}

function cellKey(goalId: string, localDate: string): string {
  return `${goalId}|${localDate}`;
}

function buildEntryLookup(
  entries: readonly DailyGoalRangeEntry[],
): Map<string, DailyGoalRangeEntry> {
  const lookup = new Map<string, DailyGoalRangeEntry>();
  for (const entry of entries) {
    lookup.set(cellKey(entry.goal.id, entry.localDate), entry);
  }
  return lookup;
}
