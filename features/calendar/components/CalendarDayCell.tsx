import { View } from 'react-native';

import { PressScale } from '@/components/gestures/PressScale';
import { Text } from '@/components/ui';
import { Weight } from '@/domain/Weight';
import { t } from '@/i18n';
import { color, radius, space } from '@/theme/tokens';

import { CALENDAR_LEVEL_BACKGROUND } from './calendarIntensityColors';
import { parseLocalDate } from '../domain/localDate';
import type { CalendarMonthDayCell } from '../hooks/useCalendarMonth';

export interface CalendarDayCellProps {
  cell: CalendarMonthDayCell;
  onPress?: ((cell: CalendarMonthDayCell) => void) | undefined;
  testID?: string | undefined;
}

/**
 * One day cell in `CalendarMonth`'s 7-column grid. Only a current-month,
 * trained day is pressable - an untrained day or a leading/trailing filler
 * day borrowed from an adjacent month (`!isCurrentMonth`) has no session to
 * navigate to, so it renders as a plain, non-interactive, muted cell with
 * its own descriptive `accessibilityLabel` rather than an
 * `accessibilityRole="button"` that does nothing on activation - the same
 * "don't offer a control with no effect" judgment call `ListRow`'s own
 * `onPress`-less branch makes.
 */
export function CalendarDayCell({ cell, onPress, testID }: CalendarDayCellProps) {
  const dayNumber = Number(cell.localDate.slice(8, 10));
  const isTrained = cell.sessionIds.length > 0;
  const hasPlanDay = cell.planDayNames.some((name) => name !== null);
  const isInteractive = cell.isCurrentMonth && isTrained && onPress !== undefined;
  const accessibilityLabel = buildCalendarDayAccessibilityLabel(cell);
  const dayNumberColor = !cell.isCurrentMonth
    ? 'tertiary'
    : cell.level === 4
      ? 'inverse'
      : 'primary';

  const content = (
    <View
      style={{
        flex: 1,
        aspectRatio: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: space['0.5'],
        opacity: cell.isCurrentMonth ? 1 : 0.35,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isTrained ? CALENDAR_LEVEL_BACKGROUND[cell.level] : 'transparent',
          borderWidth: isTrained ? 0 : 1,
          borderColor: color.border,
        }}
      >
        <Text variant="footnote" color={dayNumberColor}>
          {dayNumber}
        </Text>
      </View>
      <View
        style={{
          width: 4,
          height: 4,
          borderRadius: radius.full,
          backgroundColor: hasPlanDay ? color.accent : 'transparent',
        }}
      />
    </View>
  );

  if (!isInteractive) {
    return (
      <View accessible accessibilityLabel={accessibilityLabel} testID={testID}>
        {content}
      </View>
    );
  }

  return (
    <PressScale
      onPress={() => onPress(cell)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {content}
    </PressScale>
  );
}

/**
 * A real, data-summarizing label per day (this phase's own precedent -
 * P11's `summarizeSeries()`/`YearlyHeatmapCard` accessibility fix, not a
 * bare "day 12" structural label). Exported so a future test can exercise
 * the branching directly rather than only through a rendered mount.
 */
export function buildCalendarDayAccessibilityLabel(cell: CalendarMonthDayCell): string {
  const dateLabel = formatCalendarDayLabel(cell.localDate);

  if (!cell.isCurrentMonth) {
    return t('calendar.dayCell.outsideMonthTemplate', { date: dateLabel });
  }
  if (cell.sessionIds.length === 0) {
    return t('calendar.dayCell.untrainedTemplate', { date: dateLabel });
  }

  // "kg", not the spelled-out "kilograms" - matches this codebase's existing
  // accessibility-label convention (e.g. `statistics.volume.accessibilityLabelTemplate`,
  // `records.list.rowAccessibilityLabelTemplate`), kept consistent here
  // rather than introducing a one-off spelled-out unit.
  const volumeLabel = Weight.fromKilograms(cell.totalVolumeKg).toDisplayString('kg');
  if (cell.sessionIds.length > 1) {
    return t('calendar.dayCell.trainedMultipleSessionsTemplate', {
      date: dateLabel,
      volume: volumeLabel,
      count: cell.sessionIds.length,
    });
  }

  const planDayName = cell.planDayNames[0] ?? null;
  return planDayName
    ? t('calendar.dayCell.trainedTemplate', { date: dateLabel, volume: volumeLabel, planDayName })
    : t('calendar.dayCell.trainedNoPlanTemplate', { date: dateLabel, volume: volumeLabel });
}

/** "August 12, 2026" - `Intl.DateTimeFormat` directly, matching `formatAchievedDate`'s own English-only-v1 (D-11) convention rather than a translation-catalog template for a pure date format. */
function formatCalendarDayLabel(localDate: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(parseLocalDate(localDate));
}
