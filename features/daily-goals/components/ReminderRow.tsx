import { Ionicons } from '@expo/vector-icons';

import { Column, Row } from '@/components/layout';
import { Badge, IconButton, Switch, Text } from '@/components/ui';
import { PressScale } from '@/components/gestures/PressScale';
import { t } from '@/i18n';
import { color, space } from '@/theme/tokens';

import type { DailyReminder } from '../types/DailyReminder';

export interface ReminderRowProps {
  reminder: DailyReminder;
  /** Resolved from the caller's own already-loaded goal list (`ReminderListScreen`'s `useAllGoals`) - `null` when `reminder.goalId` is `null` (standalone) or the linked goal can no longer be found (a defensive fallback, not an expected state given `ON DELETE SET NULL`). */
  linkedGoalName: string | null;
  onPress: () => void;
  onToggleEnabled: (isEnabled: boolean) => void;
  onViewStats: () => void;
  onDelete: () => void;
  testID?: string | undefined;
}

/**
 * `ReminderListScreen`'s row. Not `DraggableList`-backed (unlike `GoalCard`)
 * - this feature's own brief scopes reminder ordering out; reminders render
 * in whatever order `DailyReminderRepository.listAll()` returns them
 * (creation order), matching this codebase's own precedent of only adding
 * `DraggableList` where the brief actually calls for reordering.
 */
export function ReminderRow({
  reminder,
  linkedGoalName,
  onPress,
  onToggleEnabled,
  onViewStats,
  onDelete,
  testID,
}: ReminderRowProps) {
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={reminder.name}
      style={{ borderBottomWidth: 1, borderBottomColor: color.border }}
      testID={testID}
    >
      <Row
        gap={3}
        align="center"
        style={{ paddingVertical: space[3], paddingHorizontal: space[4] }}
      >
        <Ionicons
          name="notifications-outline"
          size={22}
          color={reminder.isEnabled ? color.accentText : color.textTertiary}
        />

        <Column gap={1} style={{ flex: 1 }}>
          <Row gap={2} align="center">
            <Text
              variant="bodyMedium"
              color={reminder.isEnabled ? 'primary' : 'tertiary'}
              numberOfLines={1}
              style={{ flex: 1 }}
            >
              {reminder.name}
            </Text>
            {!reminder.isEnabled ? (
              <Badge
                label={t('dailyGoals.reminders.disabledBadgeLabel')}
                tone="neutral"
                size="sm"
              />
            ) : null}
          </Row>
          <Text variant="footnote" color="secondary">
            {linkedGoalName
              ? t('dailyGoals.reminders.linkedGoalLabelTemplate', { goal: linkedGoalName })
              : t('dailyGoals.reminders.standaloneLabel')}
          </Text>
        </Column>

        <Row gap={1} align="center">
          <Switch
            value={reminder.isEnabled}
            onValueChange={onToggleEnabled}
            accessibilityLabel={t(
              reminder.isEnabled
                ? 'dailyGoals.reminders.disableAccessibilityLabelTemplate'
                : 'dailyGoals.reminders.enableAccessibilityLabelTemplate',
              { name: reminder.name },
            )}
            testID={testID ? `${testID}-enabled-switch` : undefined}
          />
          <IconButton
            icon={<Ionicons name="stats-chart-outline" size={18} color={color.textTertiary} />}
            variant="ghost"
            size="sm"
            accessibilityLabel={t('dailyGoals.reminders.statsAccessibilityLabelTemplate', {
              name: reminder.name,
            })}
            onPress={onViewStats}
            testID={testID ? `${testID}-stats` : undefined}
          />
          <IconButton
            icon={<Ionicons name="trash-outline" size={18} color={color.danger} />}
            variant="ghost"
            size="sm"
            accessibilityLabel={t('dailyGoals.reminders.deleteAccessibilityLabelTemplate', {
              name: reminder.name,
            })}
            onPress={onDelete}
            testID={testID ? `${testID}-delete` : undefined}
          />
        </Row>
      </Row>
    </PressScale>
  );
}
