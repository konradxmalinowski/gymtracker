import { View } from 'react-native';

import { Text } from '@/components/ui';
import { t } from '@/i18n';
import { space } from '@/theme/tokens';

import { CalendarDayCell } from './CalendarDayCell';
import type { CalendarMonthDayCell } from '../hooks/useCalendarMonth';

export interface CalendarMonthProps {
  cells: readonly CalendarMonthDayCell[];
  onDayPress: (cell: CalendarMonthDayCell) => void;
  testID?: string | undefined;
}

const WEEKDAY_KEYS = [
  'calendar.weekday.mon',
  'calendar.weekday.tue',
  'calendar.weekday.wed',
  'calendar.weekday.thu',
  'calendar.weekday.fri',
  'calendar.weekday.sat',
  'calendar.weekday.sun',
] as const;

/**
 * The 7-column, Monday-first week grid `generateMonthGrid` produces
 * (always a whole number of weeks - 35 or 42 cells, per that function's own
 * doc comment). Laid out with `flexWrap: 'wrap'` at `14.2857...%` per cell
 * (100/7) rather than chunking `cells` into week-sized rows in JS - simpler,
 * and `CalendarDayCell`'s own `aspectRatio: 1` keeps every cell square
 * regardless of row count.
 *
 * The weekday header row is one collapsed `accessible` node with a single
 * summary label (accessibility review finding A11Y-P12-001,
 * `reports/accessibility-2026-08-19-p12.md`) - the same `CalendarLegend.tsx`
 * shape, applied here for the same reason: without it, RNTL/VoiceOver/
 * TalkBack expose "Mon"/"Tue"/... as seven separate, individually-focusable
 * stops with no indication they're calendar column headers (RN has no real
 * header-to-data-cell association, and each day cell's own label already
 * carries the full date, not the weekday), so a bare per-letter swipe stop
 * is pure noise rather than useful context.
 */
export function CalendarMonth({ cells, onDayPress, testID }: CalendarMonthProps) {
  return (
    <View testID={testID}>
      <View
        accessible
        accessibilityLabel={t('calendar.month.weekdayHeaderAccessibilityLabel')}
        style={{ flexDirection: 'row', marginBottom: space[2] }}
      >
        {WEEKDAY_KEYS.map((key) => (
          <View key={key} style={{ width: `${100 / 7}%`, alignItems: 'center' }}>
            <Text variant="caption" color="tertiary">
              {t(key)}
            </Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((cell) => (
          <View key={cell.localDate} style={{ width: `${100 / 7}%`, padding: space['0.5'] }}>
            <CalendarDayCell
              cell={cell}
              onPress={onDayPress}
              testID={testID ? `${testID}-day-${cell.localDate}` : undefined}
            />
          </View>
        ))}
      </View>
    </View>
  );
}
