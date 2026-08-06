import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import {
  View,
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
} from 'react-native';

import { Column, Row } from '@/components/layout';
import { Badge, IconButton, Text } from '@/components/ui';
import { PressScale } from '@/components/gestures/PressScale';
import type { PlanListItem } from '@/features/plans';
import { t } from '@/i18n';
import { color, space } from '@/theme/tokens';

export interface PlanCardProps {
  plan: PlanListItem;
  onPress: () => void;
  onToggleActive: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Slot for `DraggableList`'s `dragHandle="handle"` grip, rendered leading - `undefined` in `dragHandle="row"` mode (the whole card is the drag surface then). */
  dragHandle?: ReactNode | undefined;
  /**
   * Forwarded straight to the root `PressScale` - `DraggableList`'s
   * `cloneElement`-based move-up/move-down accessibility fix (P5) relies on
   * this component actually accepting and applying these three props rather
   * than silently dropping them, which is what a closed prop interface with
   * no pass-through was doing before this fix (accessibility review finding:
   * `DraggableList`'s own unit tests only exercised the mechanism against a
   * bare `<Text>`, which forwards arbitrary props unlike a real component).
   */
  accessible?: boolean | undefined;
  accessibilityActions?: readonly AccessibilityActionInfo[] | undefined;
  onAccessibilityAction?: ((event: AccessibilityActionEvent) => void) | undefined;
  testID?: string | undefined;
}

/**
 * List screen's row (ARCHITECTURE.md section 11's design-system component
 * table: `plans` -> `PlanCard`). Same nesting pattern
 * `ExerciseListItemRow.tsx` establishes in P4: the row-level tap (navigate
 * to `PlanDetailScreen`) and each trailing icon button's own tap are both
 * `PressScale`s, one nested inside the other - RN's touch responder system
 * resolves that correctly (the inner control claims its own taps, the outer
 * row claims everything else).
 */
export function PlanCard({
  plan,
  onPress,
  onToggleActive,
  onRename,
  onDuplicate,
  onDelete,
  dragHandle,
  accessible,
  accessibilityActions,
  onAccessibilityAction,
  testID,
}: PlanCardProps) {
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={plan.name}
      accessible={accessible}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      style={{ borderBottomWidth: 1, borderBottomColor: color.border }}
      testID={testID}
    >
      <Row gap={3} align="center" style={{ paddingVertical: space[3], paddingHorizontal: space[4] }}>
        {dragHandle ? <View>{dragHandle}</View> : null}

        <Column gap={1} style={{ flex: 1 }}>
          <Row gap={2} align="center">
            <Text variant="bodyMedium" color="primary" numberOfLines={1} style={{ flex: 1 }}>
              {plan.name}
            </Text>
            {plan.isActive ? (
              <Badge label={t('plans.list.activeLabel')} tone="accent" size="sm" />
            ) : null}
          </Row>
          <Text variant="footnote" color="secondary">
            {t('plans.list.dayCountLabel', { count: plan.dayCount })}
          </Text>
        </Column>

        <Row gap={1} align="center">
          <IconButton
            icon={
              <Ionicons
                name={plan.isActive ? 'star' : 'star-outline'}
                size={18}
                color={plan.isActive ? color.accent : color.textTertiary}
              />
            }
            variant="ghost"
            size="sm"
            accessibilityLabel={t('plans.list.setActiveAccessibilityLabelTemplate', {
              name: plan.name,
            })}
            onPress={onToggleActive}
            testID={testID ? `${testID}-set-active` : undefined}
          />
          <IconButton
            icon={<Ionicons name="create-outline" size={18} color={color.textTertiary} />}
            variant="ghost"
            size="sm"
            accessibilityLabel={t('plans.list.renameAccessibilityLabelTemplate', {
              name: plan.name,
            })}
            onPress={onRename}
            testID={testID ? `${testID}-rename` : undefined}
          />
          <IconButton
            icon={<Ionicons name="copy-outline" size={18} color={color.textTertiary} />}
            variant="ghost"
            size="sm"
            accessibilityLabel={t('plans.list.duplicateAccessibilityLabelTemplate', {
              name: plan.name,
            })}
            onPress={onDuplicate}
            testID={testID ? `${testID}-duplicate` : undefined}
          />
          <IconButton
            icon={<Ionicons name="trash-outline" size={18} color={color.danger} />}
            variant="ghost"
            size="sm"
            accessibilityLabel={t('plans.list.deleteAccessibilityLabelTemplate', {
              name: plan.name,
            })}
            onPress={onDelete}
            testID={testID ? `${testID}-delete` : undefined}
          />
        </Row>
      </Row>
    </PressScale>
  );
}
