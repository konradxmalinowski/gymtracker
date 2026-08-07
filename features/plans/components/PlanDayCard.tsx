import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import {
  View,
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
} from 'react-native';

import { Column, Row } from '@/components/layout';
import { IconButton, Text } from '@/components/ui';
import { PressScale } from '@/components/gestures/PressScale';
import type { PlanDay } from '@/features/plans';
import { t } from '@/i18n';
import { color, space } from '@/theme/tokens';

export interface PlanDayCardProps {
  day: PlanDay;
  onPress: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** P6: starts a workout from this day (`startFromPlanDay`) - optional so every other `PlanDayCard` consumer (there is only this one screen today) doesn't need updating in lockstep. */
  onStart?: (() => void) | undefined;
  dragHandle?: ReactNode | undefined;
  /** Forwarded to the root `PressScale` - see `PlanCard.tsx`'s identical props for why this can't be a closed prop interface with no pass-through. */
  accessible?: boolean | undefined;
  accessibilityActions?: readonly AccessibilityActionInfo[] | undefined;
  onAccessibilityAction?: ((event: AccessibilityActionEvent) => void) | undefined;
  testID?: string | undefined;
}

/** Plan detail screen's row (ARCHITECTURE.md's `plans` component table). Same tap/actions layout as `PlanCard`, one level down the aggregate. */
export function PlanDayCard({
  day,
  onPress,
  onRename,
  onDuplicate,
  onDelete,
  onStart,
  dragHandle,
  accessible,
  accessibilityActions,
  onAccessibilityAction,
  testID,
}: PlanDayCardProps) {
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={day.name}
      accessible={accessible}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      style={{ borderBottomWidth: 1, borderBottomColor: color.border }}
      testID={testID}
    >
      <Row gap={3} align="center" style={{ paddingVertical: space[3], paddingHorizontal: space[4] }}>
        {dragHandle ? <View>{dragHandle}</View> : null}

        <Column gap={1} style={{ flex: 1 }}>
          <Text variant="bodyMedium" color="primary" numberOfLines={1}>
            {day.name}
          </Text>
          <Text variant="footnote" color="secondary">
            {t('plans.detail.exerciseCountLabel', { count: day.exercises.length })}
          </Text>
        </Column>

        <Row gap={1} align="center">
          {onStart ? (
            <IconButton
              icon={<Ionicons name="play-circle-outline" size={20} color={color.accent} />}
              variant="ghost"
              size="sm"
              accessibilityLabel={t('plans.detail.startWorkoutAccessibilityLabelTemplate', {
                name: day.name,
              })}
              onPress={onStart}
              testID={testID ? `${testID}-start` : undefined}
            />
          ) : null}
          <IconButton
            icon={<Ionicons name="create-outline" size={18} color={color.textTertiary} />}
            variant="ghost"
            size="sm"
            accessibilityLabel={t('plans.detail.renameAccessibilityLabelTemplate', {
              name: day.name,
            })}
            onPress={onRename}
            testID={testID ? `${testID}-rename` : undefined}
          />
          <IconButton
            icon={<Ionicons name="copy-outline" size={18} color={color.textTertiary} />}
            variant="ghost"
            size="sm"
            accessibilityLabel={t('plans.detail.duplicateAccessibilityLabelTemplate', {
              name: day.name,
            })}
            onPress={onDuplicate}
            testID={testID ? `${testID}-duplicate` : undefined}
          />
          <IconButton
            icon={<Ionicons name="trash-outline" size={18} color={color.danger} />}
            variant="ghost"
            size="sm"
            accessibilityLabel={t('plans.detail.deleteAccessibilityLabelTemplate', {
              name: day.name,
            })}
            onPress={onDelete}
            testID={testID ? `${testID}-delete` : undefined}
          />
        </Row>
      </Row>
    </PressScale>
  );
}
