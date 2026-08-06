import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { Column, Row } from '@/components/layout';
import { Badge, Button, IconButton, Text } from '@/components/ui';
import type { PlanAggregate } from '@/features/plans';
import { t } from '@/i18n';
import { color, space } from '@/theme/tokens';

export interface PlanEditorHeaderProps {
  plan: PlanAggregate;
  onRename: () => void;
  onSetActive: () => void;
  testID?: string | undefined;
}

/**
 * `PlanDetailScreen`'s header (ARCHITECTURE.md's `plans` component table):
 * the plan-level actions (rename, set active) that don't belong to any one
 * day. Day-level actions (add/rename/duplicate/delete a day) live on
 * `PlanDayCard` and the screen's own "Add day" affordance instead - this
 * component is deliberately just the plan's own identity + the two actions
 * that mutate the plan row itself.
 */
export function PlanEditorHeader({ plan, onRename, onSetActive, testID }: PlanEditorHeaderProps) {
  return (
    <View testID={testID}>
      <Column gap={2} style={{ paddingVertical: space[2] }}>
        <Row gap={2} align="center">
          <Text variant="title1" color="primary" style={{ flex: 1 }}>
            {plan.name}
          </Text>
          <IconButton
            icon={<Ionicons name="create-outline" size={20} color={color.textTertiary} />}
            variant="ghost"
            accessibilityLabel={t('plans.detail.renamePlanButtonLabel')}
            onPress={onRename}
            testID={testID ? `${testID}-rename` : undefined}
          />
        </Row>

        {plan.description ? (
          <Text variant="body" color="secondary">
            {plan.description}
          </Text>
        ) : null}

        {plan.isActive ? (
          <Badge label={t('plans.detail.activePlanLabel')} tone="accent" />
        ) : (
          <Button
            variant="secondary"
            size="sm"
            label={t('plans.detail.setActiveButtonLabel')}
            onPress={onSetActive}
            testID={testID ? `${testID}-set-active` : undefined}
          />
        )}
      </Column>
    </View>
  );
}
