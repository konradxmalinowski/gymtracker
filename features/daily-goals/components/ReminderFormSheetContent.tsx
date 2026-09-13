import { useState } from 'react';

import { Column, Row } from '@/components/layout';
import {
  Button,
  Chip,
  SegmentedControl,
  StepperField,
  Switch,
  Text,
  TextField,
} from '@/components/ui';
import {
  DAILY_REMINDER_NAME_MAX_LENGTH,
  DailyReminderValidationError,
  type CreateDailyReminderInput,
  type DailyGoal,
  type DailyReminder,
  type ReminderType,
} from '@/features/daily-goals';
import { t } from '@/i18n';
import { useSheetStore } from '@/stores/sheetStore';
import { space } from '@/theme/tokens';

import { WeekdayPicker } from './WeekdayPicker';
import {
  useCreateReminder,
  useSetReminderEnabled,
  useUpdateReminder,
} from '../hooks/useDailyReminders';

const DEFAULT_TIME_OF_DAY = '08:00';
const DEFAULT_INTERVAL_MINUTES = 60;
const ALL_WEEKDAYS = 127;

export type ReminderFormSheetContentProps =
  | { mode: 'create'; goals: readonly DailyGoal[] }
  | { mode: 'edit'; reminder: DailyReminder; goals: readonly DailyGoal[] };

interface ReminderDraft {
  name: string;
  reminderType: ReminderType;
  timeOfDay: string;
  intervalMinutes: number;
  activeWeekdays: number;
  goalId: string | null;
  isEnabled: boolean;
}

function parseTime(time: string): { hour: number; minute: number } {
  const [hourStr, minuteStr] = time.split(':');
  return { hour: Number(hourStr) || 0, minute: Number(minuteStr) || 0 };
}

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function initialDraft(props: ReminderFormSheetContentProps): ReminderDraft {
  if (props.mode === 'edit') {
    const { reminder } = props;
    return {
      name: reminder.name,
      reminderType: reminder.reminderType,
      timeOfDay: reminder.timeOfDay ?? DEFAULT_TIME_OF_DAY,
      intervalMinutes: reminder.intervalMinutes ?? DEFAULT_INTERVAL_MINUTES,
      activeWeekdays: reminder.activeWeekdays,
      goalId: reminder.goalId,
      isEnabled: reminder.isEnabled,
    };
  }
  return {
    name: '',
    reminderType: 'scheduled',
    timeOfDay: DEFAULT_TIME_OF_DAY,
    intervalMinutes: DEFAULT_INTERVAL_MINUTES,
    activeWeekdays: ALL_WEEKDAYS,
    goalId: null,
    isEnabled: true,
  };
}

/**
 * Rendered inside the app-root `SheetHost`/`BottomSheet` (`present()`d from
 * `ReminderListScreen`) - same "sheet content owns whatever can change while
 * it's open" shape `PlanDayExerciseEditSheetContent`/
 * `PlanNameSheetContent` already establish, plain `useState` draft rather
 * than React Hook Form (that heavier pattern is reserved in this codebase
 * for full-screen routes like `ExerciseFormScreen`/`GoalFormScreen`, not
 * sheet content). No icon picker here, unlike `GoalFormScreen` - this pass's
 * own scope trim: `daily_reminder.icon` exists in the schema but nothing in
 * this feature's brief asked for a reminder icon picker, and every reminder
 * row already shows a bell glyph plus its linked-goal name (if any), so the
 * field stays `null` through this UI rather than adding a second icon
 * picker for marginal value.
 */
export function ReminderFormSheetContent(props: ReminderFormSheetContentProps) {
  const [draft, setDraft] = useState<ReminderDraft>(() => initialDraft(props));
  const [formError, setFormError] = useState<string | null>(null);
  const createReminder = useCreateReminder();
  const updateReminder = useUpdateReminder();
  const setReminderEnabled = useSetReminderEnabled();
  const dismiss = useSheetStore((state) => state.dismissCurrent);

  const { hour, minute } = parseTime(draft.timeOfDay);
  const isPending =
    createReminder.isPending || updateReminder.isPending || setReminderEnabled.isPending;

  function updateDraft(patch: Partial<ReminderDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  async function handleSave() {
    setFormError(null);
    const trimmedName = draft.name.trim();

    const basePayload: Omit<CreateDailyReminderInput, 'goalId'> & { goalId: string | null } = {
      name: trimmedName,
      goalId: draft.goalId,
      reminderType: draft.reminderType,
      timeOfDay: draft.reminderType === 'scheduled' ? draft.timeOfDay : null,
      intervalMinutes: draft.reminderType === 'interval' ? draft.intervalMinutes : null,
      activeWeekdays: draft.activeWeekdays,
    };

    try {
      if (props.mode === 'create') {
        await createReminder.mutateAsync(basePayload);
      } else {
        await updateReminder.mutateAsync({ id: props.reminder.id, patch: basePayload });
        if (props.reminder.isEnabled !== draft.isEnabled) {
          await setReminderEnabled.mutateAsync({
            reminder: { ...props.reminder, ...basePayload },
            isEnabled: draft.isEnabled,
          });
        }
      }
      dismiss();
    } catch (error) {
      if (error instanceof DailyReminderValidationError) {
        setFormError(error.issues[0]?.message ?? t('dailyGoals.reminderForm.genericErrorMessage'));
      } else {
        setFormError(t('dailyGoals.reminderForm.genericErrorMessage'));
      }
    }
  }

  return (
    <Column gap={4} style={{ paddingTop: space[2] }}>
      <Text variant="title3" color="primary">
        {props.mode === 'create'
          ? t('dailyGoals.reminderForm.createTitle')
          : t('dailyGoals.reminderForm.editTitle')}
      </Text>

      <TextField
        label={t('dailyGoals.reminderForm.nameLabel')}
        placeholder={t('dailyGoals.reminderForm.namePlaceholder')}
        value={draft.name}
        onChangeText={(value) => updateDraft({ name: value })}
        maxLength={DAILY_REMINDER_NAME_MAX_LENGTH}
        testID="reminder-form-name"
      />

      <Column gap={2}>
        <Text variant="label" color="secondary">
          {t('dailyGoals.reminderForm.typeSectionTitle')}
        </Text>
        <SegmentedControl
          options={[
            { value: 'scheduled', label: t('dailyGoals.reminderForm.typeScheduled') },
            { value: 'interval', label: t('dailyGoals.reminderForm.typeInterval') },
          ]}
          value={draft.reminderType}
          onChange={(value) => updateDraft({ reminderType: value })}
          testID="reminder-form-type"
        />
      </Column>

      {draft.reminderType === 'scheduled' ? (
        <Column gap={2}>
          <Text variant="label" color="secondary">
            {t('dailyGoals.reminderForm.timeSectionTitle')}
          </Text>
          <Row gap={3} align="center">
            <StepperField
              value={hour}
              onChange={(value) => updateDraft({ timeOfDay: formatTime(value ?? 0, minute) })}
              step={1}
              min={0}
              max={23}
              accessibilityLabel={t('dailyGoals.reminderForm.timeHourAccessibilityLabel')}
              testID="reminder-form-hour"
            />
            <Text variant="title3" color="secondary">
              {':'}
            </Text>
            <StepperField
              value={minute}
              onChange={(value) => updateDraft({ timeOfDay: formatTime(hour, value ?? 0) })}
              step={5}
              min={0}
              max={55}
              accessibilityLabel={t('dailyGoals.reminderForm.timeMinuteAccessibilityLabel')}
              testID="reminder-form-minute"
            />
          </Row>
        </Column>
      ) : (
        <Column gap={2}>
          <Text variant="label" color="secondary">
            {t('dailyGoals.reminderForm.intervalSectionTitle')}
          </Text>
          <StepperField
            value={draft.intervalMinutes}
            onChange={(value) => updateDraft({ intervalMinutes: Math.max(15, value ?? 15) })}
            step={15}
            min={15}
            unitSuffix="min"
            accessibilityLabel={t('dailyGoals.reminderForm.intervalMinutesAccessibilityLabel')}
            testID="reminder-form-interval"
          />
        </Column>
      )}

      <Column gap={2}>
        <Text variant="label" color="secondary">
          {t('dailyGoals.reminderForm.daysSectionTitle')}
        </Text>
        <WeekdayPicker
          activeWeekdays={draft.activeWeekdays}
          onChange={(value) => updateDraft({ activeWeekdays: value })}
          testID="reminder-form-days"
        />
      </Column>

      <Column gap={2}>
        <Text variant="label" color="secondary">
          {t('dailyGoals.reminderForm.goalSectionTitle')}
        </Text>
        <Row gap={2} wrap>
          <Chip
            label={t('dailyGoals.reminderForm.goalNoneOption')}
            selected={draft.goalId === null}
            onPress={() => updateDraft({ goalId: null })}
            testID="reminder-form-goal-none"
          />
          {props.goals.map((goal) => (
            <Chip
              key={goal.id}
              label={goal.name}
              selected={draft.goalId === goal.id}
              onPress={() => updateDraft({ goalId: goal.id })}
              testID={`reminder-form-goal-${goal.id}`}
            />
          ))}
        </Row>
      </Column>

      {props.mode === 'edit' ? (
        <Row justify="space-between" align="center">
          <Column gap={1} style={{ flex: 1 }}>
            <Text variant="body" color="primary">
              {t('dailyGoals.reminderForm.enabledRowTitle')}
            </Text>
            <Text variant="footnote" color="secondary">
              {t('dailyGoals.reminderForm.enabledRowSubtitle')}
            </Text>
          </Column>
          <Switch
            value={draft.isEnabled}
            onValueChange={(value) => updateDraft({ isEnabled: value })}
            accessibilityLabel={t('dailyGoals.reminderForm.enabledRowTitle')}
            testID="reminder-form-enabled-switch"
          />
        </Row>
      ) : null}

      {formError ? (
        <Text
          variant="caption"
          color="danger"
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          {formError}
        </Text>
      ) : null}

      <Button
        variant="primary"
        label={t('dailyGoals.reminderForm.saveLabel')}
        onPress={() => void handleSave()}
        loading={isPending}
        fullWidth
        testID="reminder-form-save"
      />
    </Column>
  );
}
