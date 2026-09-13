import { View } from 'react-native';

import { Row } from '@/components/layout';
import { Chip } from '@/components/ui';
import { t } from '@/i18n';
import type { MondayBasedWeekdayIndex } from '../domain/weekdayBitmask';
import { isWeekdayActive } from '../domain/weekdayBitmask';

type WeekdayLabelKey =
  | 'dailyGoals.weekday.mon'
  | 'dailyGoals.weekday.tue'
  | 'dailyGoals.weekday.wed'
  | 'dailyGoals.weekday.thu'
  | 'dailyGoals.weekday.fri'
  | 'dailyGoals.weekday.sat'
  | 'dailyGoals.weekday.sun';

/**
 * Monday-first chip row, one chip per bit of `daily_goal.active_weekdays`/
 * `daily_reminder.active_weekdays` (ADR-0017 Decision 1: bit0=Monday..
 * bit6=Sunday). Deliberately its own small component rather than reusing
 * `RemindersSettingsScreen.tsx`'s `DAY_CHIPS` - that constant maps to
 * `WorkoutReminderService`'s **Sunday-based** `reminders.days` convention
 * (JS `Date.getDay()`, 0=Sunday), a completely different bit/index
 * numbering from this feature's own `weekdayBitmask.ts`. Reusing it here
 * would silently produce the wrong bitmask - see that file's own header
 * comment for the explicit "these are different conventions" warning this
 * component is built to respect.
 */
const WEEKDAY_CHIPS: { index: MondayBasedWeekdayIndex; labelKey: WeekdayLabelKey }[] = [
  { index: 0, labelKey: 'dailyGoals.weekday.mon' },
  { index: 1, labelKey: 'dailyGoals.weekday.tue' },
  { index: 2, labelKey: 'dailyGoals.weekday.wed' },
  { index: 3, labelKey: 'dailyGoals.weekday.thu' },
  { index: 4, labelKey: 'dailyGoals.weekday.fri' },
  { index: 5, labelKey: 'dailyGoals.weekday.sat' },
  { index: 6, labelKey: 'dailyGoals.weekday.sun' },
];

export interface WeekdayPickerProps {
  activeWeekdays: number;
  onChange: (activeWeekdays: number) => void;
  disabled?: boolean | undefined;
  testID?: string | undefined;
}

/**
 * `daily_goal`/`daily_reminder`'s own CHECK constraint requires at least one
 * bit set (`active_weekdays BETWEEN 1 AND 127`) - this component enforces
 * that client-side too (the last remaining active day can't be toggled off),
 * so the form never lets the user reach an unsaveable state rather than
 * surfacing that as a generic server error after the fact.
 */
export function WeekdayPicker({ activeWeekdays, onChange, disabled, testID }: WeekdayPickerProps) {
  function toggleDay(index: MondayBasedWeekdayIndex) {
    const isActive = isWeekdayActive(activeWeekdays, index);
    if (isActive && (activeWeekdays & ~(1 << index)) === 0) {
      // Last remaining active day - refuse to clear it.
      return;
    }
    const next = isActive ? activeWeekdays & ~(1 << index) : activeWeekdays | (1 << index);
    onChange(next);
  }

  return (
    <View testID={testID}>
      <Row gap={2} wrap>
        {WEEKDAY_CHIPS.map(({ index, labelKey }) => (
          <Chip
            key={index}
            label={t(labelKey)}
            selected={isWeekdayActive(activeWeekdays, index)}
            onPress={() => toggleDay(index)}
            disabled={disabled}
            testID={testID ? `${testID}-${index}` : undefined}
          />
        ))}
      </Row>
    </View>
  );
}
