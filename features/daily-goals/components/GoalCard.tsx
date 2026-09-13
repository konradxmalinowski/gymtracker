import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { View, type AccessibilityActionEvent, type AccessibilityActionInfo } from 'react-native';

import { Column, Row } from '@/components/layout';
import { Badge, IconButton, Switch, Text } from '@/components/ui';
import { PressScale } from '@/components/gestures/PressScale';
import { t } from '@/i18n';
import { color, space } from '@/theme/tokens';

import { resolveGoalIconName } from './goalIcons';
import type { DailyGoal } from '../types/DailyGoal';

const TYPE_LABEL_KEY: Record<
  DailyGoal['goalType'],
  | 'dailyGoals.manage.typeLabelBoolean'
  | 'dailyGoals.manage.typeLabelCounter'
  | 'dailyGoals.manage.typeLabelNumeric'
> = {
  boolean: 'dailyGoals.manage.typeLabelBoolean',
  counter: 'dailyGoals.manage.typeLabelCounter',
  numeric: 'dailyGoals.manage.typeLabelNumeric',
};

function targetSummary(goal: DailyGoal): string | null {
  if (goal.goalType === 'boolean' || goal.targetValue === null) {
    return null;
  }
  return goal.unit ? `${goal.targetValue} ${goal.unit}` : String(goal.targetValue);
}

export interface GoalCardProps {
  goal: DailyGoal;
  onPress: () => void;
  onToggleEnabled: (isEnabled: boolean) => void;
  onDelete: () => void;
  /** `DraggableList`'s `dragHandle="handle"` grip, rendered leading - mirrors `PlanCard`'s own slot exactly. */
  dragHandle?: ReactNode | undefined;
  /** Forwarded to the root `PressScale` - see `PlanCard.tsx`'s own doc comment for why this pass-through matters for `DraggableList`'s move-up/move-down accessibility fix. */
  accessible?: boolean | undefined;
  accessibilityActions?: readonly AccessibilityActionInfo[] | undefined;
  onAccessibilityAction?: ((event: AccessibilityActionEvent) => void) | undefined;
  testID?: string | undefined;
}

/**
 * `GoalListScreen`'s row - same nesting pattern `PlanCard` establishes (a
 * row-level `PressScale` navigating to edit, with independent trailing
 * controls each claiming their own taps).
 */
export function GoalCard({
  goal,
  onPress,
  onToggleEnabled,
  onDelete,
  dragHandle,
  accessible,
  accessibilityActions,
  onAccessibilityAction,
  testID,
}: GoalCardProps) {
  const summary = targetSummary(goal);

  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={goal.name}
      accessible={accessible}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      style={{ borderBottomWidth: 1, borderBottomColor: color.border }}
      testID={testID}
    >
      <Row
        gap={3}
        align="center"
        style={{ paddingVertical: space[3], paddingHorizontal: space[4] }}
      >
        {dragHandle ? <View>{dragHandle}</View> : null}

        <Ionicons
          name={resolveGoalIconName(goal.icon)}
          size={22}
          color={goal.isEnabled ? color.accentText : color.textTertiary}
        />

        <Column gap={1} style={{ flex: 1 }}>
          <Row gap={2} align="center">
            <Text
              variant="bodyMedium"
              color={goal.isEnabled ? 'primary' : 'tertiary'}
              numberOfLines={1}
              style={{ flex: 1 }}
            >
              {goal.name}
            </Text>
            {!goal.isEnabled ? (
              <Badge label={t('dailyGoals.manage.disabledBadgeLabel')} tone="neutral" size="sm" />
            ) : null}
          </Row>
          <Text variant="footnote" color="secondary">
            {summary
              ? `${t(TYPE_LABEL_KEY[goal.goalType])} · ${summary}`
              : t(TYPE_LABEL_KEY[goal.goalType])}
          </Text>
        </Column>

        <Row gap={1} align="center">
          <Switch
            value={goal.isEnabled}
            onValueChange={onToggleEnabled}
            accessibilityLabel={t(
              goal.isEnabled
                ? 'dailyGoals.manage.disableAccessibilityLabelTemplate'
                : 'dailyGoals.manage.enableAccessibilityLabelTemplate',
              { name: goal.name },
            )}
            testID={testID ? `${testID}-enabled-switch` : undefined}
          />
          <IconButton
            icon={<Ionicons name="trash-outline" size={18} color={color.danger} />}
            variant="ghost"
            size="sm"
            accessibilityLabel={t('dailyGoals.manage.deleteAccessibilityLabelTemplate', {
              name: goal.name,
            })}
            onPress={onDelete}
            testID={testID ? `${testID}-delete` : undefined}
          />
        </Row>
      </Row>
    </PressScale>
  );
}
