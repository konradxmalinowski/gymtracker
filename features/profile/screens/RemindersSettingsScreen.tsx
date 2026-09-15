import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { Column, Row, Screen } from '@/components/layout';
import { Skeleton } from '@/components/feedback';
import { Chip, StepperField, Surface, Switch, Text } from '@/components/ui';
import { t } from '@/i18n';
import { useContainer } from '@/services/container';
import type { WorkoutReminderService } from '@/services/notifications';
import { space } from '@/theme/tokens';

import { useReminderSettings } from '../hooks/useSettings';

type DayLabelKey =
  | 'remindersSettings.dayMon'
  | 'remindersSettings.dayTue'
  | 'remindersSettings.dayWed'
  | 'remindersSettings.dayThu'
  | 'remindersSettings.dayFri'
  | 'remindersSettings.daySat'
  | 'remindersSettings.daySun';

/** Monday-first for display (matching `CalendarMonth`'s own Monday-anchored week convention elsewhere in this app), each mapped back to `reminders.days`' own 0=Sunday..6=Saturday storage (JS `Date.getDay()` convention) on write. */
const DAY_CHIPS: { value: number; labelKey: DayLabelKey }[] = [
  { value: 1, labelKey: 'remindersSettings.dayMon' },
  { value: 2, labelKey: 'remindersSettings.dayTue' },
  { value: 3, labelKey: 'remindersSettings.dayWed' },
  { value: 4, labelKey: 'remindersSettings.dayThu' },
  { value: 5, labelKey: 'remindersSettings.dayFri' },
  { value: 6, labelKey: 'remindersSettings.daySat' },
  { value: 0, labelKey: 'remindersSettings.daySun' },
];

function parseTime(time: string): { hour: number; minute: number } {
  const [hourStr, minuteStr] = time.split(':');
  return { hour: Number(hourStr) || 0, minute: Number(minuteStr) || 0 };
}

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * `app/profile/settings/reminders.tsx`'s screen body - Gravitus-inspired
 * refresh's local weekly workout reminders. Lives under `profile` for the
 * same reason `PlateCalculatorSettingsScreen` does: `useReminderSettings`
 * (`../hooks/useSettings.ts`) isn't barrel-exported, so only `profile`'s own
 * screens may import it directly without crossing the
 * cross-feature-imports-through-a-barrel rule.
 *
 * No `@react-native-community/datetimepicker` (or any other new dependency)
 * - `components/ui` has no time-picker primitive today, and this pass's own
 * "no new native dependency unless truly unavoidable" brief was taken
 * literally: two `StepperField`s (hour 0-23, minute in 5-minute steps),
 * mirroring `ProgressionSettingsScreen`'s existing "commit on each field's
 * own change" shape, compose the `HH:mm` string this feature already stores
 * and schedules from.
 */
export function RemindersSettingsScreen() {
  const { workoutReminderService } = useContainer();
  const { enabled, days, time, isPending, setEnabled, setDays, setTime } = useReminderSettings();

  const showSkeleton =
    isPending || enabled === undefined || days === undefined || time === undefined;

  useEffect(() => {
    if (showSkeleton) {
      AccessibilityInfo.announceForAccessibility(t('common.loading'));
    }
  }, [showSkeleton]);

  return (
    <Screen scroll edges={['bottom']} testID="reminders-settings-screen">
      <Column gap={6} style={{ paddingVertical: space[6] }}>
        {showSkeleton ? (
          <RemindersSettingsSkeleton />
        ) : (
          <RemindersControls
            initialEnabled={enabled}
            initialDays={days}
            initialTime={time}
            workoutReminderService={workoutReminderService}
            onEnabledChange={setEnabled}
            onDaysChange={setDays}
            onTimeChange={setTime}
          />
        )}
      </Column>
    </Screen>
  );
}

function RemindersControls({
  initialEnabled,
  initialDays,
  initialTime,
  workoutReminderService,
  onEnabledChange,
  onDaysChange,
  onTimeChange,
}: {
  initialEnabled: boolean;
  initialDays: readonly number[];
  initialTime: string;
  workoutReminderService: WorkoutReminderService;
  onEnabledChange: (value: boolean) => void;
  onDaysChange: (value: number[]) => void;
  onTimeChange: (value: string) => void;
}) {
  const [enabled, setEnabledState] = useState(initialEnabled);
  const [days, setDaysState] = useState<number[]>([...initialDays]);
  const [time, setTimeState] = useState(initialTime);
  const { hour, minute } = parseTime(time);

  // Save-then-reschedule (cancel-then-reschedule, per
  // `WorkoutReminderService.reschedule`'s own doc comment) after every
  // change - simple over clever, since this is a settings-screen action
  // with no latency budget to protect, not a hot path.
  function applySchedule(nextEnabled: boolean, nextDays: readonly number[], nextTime: string) {
    if (nextEnabled) {
      void workoutReminderService.reschedule(nextDays, nextTime);
    } else {
      void workoutReminderService.cancelAll();
    }
  }

  function handleEnabledChange(value: boolean) {
    setEnabledState(value);
    onEnabledChange(value);
    applySchedule(value, days, time);
  }

  function handleToggleDay(day: number) {
    const nextDays = days.includes(day)
      ? days.filter((candidate) => candidate !== day)
      : [...days, day].sort((a, b) => a - b);
    setDaysState(nextDays);
    onDaysChange(nextDays);
    if (enabled) {
      applySchedule(enabled, nextDays, time);
    }
  }

  function handleHourChange(value: number | null) {
    const nextTime = formatTime(value ?? 0, minute);
    setTimeState(nextTime);
    onTimeChange(nextTime);
    if (enabled) {
      applySchedule(enabled, days, nextTime);
    }
  }

  function handleMinuteChange(value: number | null) {
    const nextTime = formatTime(hour, value ?? 0);
    setTimeState(nextTime);
    onTimeChange(nextTime);
    if (enabled) {
      applySchedule(enabled, days, nextTime);
    }
  }

  return (
    <>
      <Surface level={1} radius="lg">
        <Row justify="space-between" align="center" style={{ padding: space[4] }}>
          <Column gap={1} style={{ flex: 1 }}>
            <Text variant="body" color="primary">
              {t('remindersSettings.enabledRowTitle')}
            </Text>
            <Text variant="footnote" color="secondary">
              {t('remindersSettings.enabledRowSubtitle')}
            </Text>
          </Column>
          <Switch
            value={enabled}
            onValueChange={handleEnabledChange}
            accessibilityLabel={t('remindersSettings.enabledRowTitle')}
            testID="reminders-settings-enabled-switch"
          />
        </Row>
      </Surface>

      <Column gap={2}>
        <Text variant="label" color="secondary">
          {t('remindersSettings.daysSectionTitle')}
        </Text>
        <Row gap={2} wrap>
          {DAY_CHIPS.map((day) => (
            <Chip
              key={day.value}
              label={t(day.labelKey)}
              selected={days.includes(day.value)}
              onPress={() => handleToggleDay(day.value)}
              disabled={!enabled}
              testID={`reminders-settings-day-${day.value}`}
            />
          ))}
        </Row>
      </Column>

      <Column gap={2}>
        <Text variant="label" color="secondary">
          {t('remindersSettings.timeSectionTitle')}
        </Text>
        <Row gap={3} align="center">
          <StepperField
            value={hour}
            onChange={handleHourChange}
            step={1}
            min={0}
            max={23}
            disabled={!enabled}
            accessibilityLabel={t('remindersSettings.timeHourAccessibilityLabel')}
            testID="reminders-settings-hour"
          />
          <Text variant="title3" color="secondary">
            :
          </Text>
          <StepperField
            value={minute}
            onChange={handleMinuteChange}
            step={5}
            min={0}
            max={55}
            disabled={!enabled}
            accessibilityLabel={t('remindersSettings.timeMinuteAccessibilityLabel')}
            testID="reminders-settings-minute"
          />
        </Row>
      </Column>
    </>
  );
}

function RemindersSettingsSkeleton() {
  return (
    <Column gap={4}>
      <Skeleton width="100%" height={64} radius="lg" />
      <Skeleton width="40%" height={16} />
      <Skeleton width="100%" height={40} radius="md" />
      <Skeleton width="40%" height={16} />
      <Skeleton width="100%" height={48} radius="md" />
    </Column>
  );
}
