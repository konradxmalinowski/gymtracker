import { Ionicons } from '@expo/vector-icons';

import { Column, Row } from '@/components/layout';
import { Button, Card, Text } from '@/components/ui';
import { EmptyState } from '@/components/feedback';
import type { PlanAggregate, PlanDay } from '@/features/plans';
import { t } from '@/i18n';
import { color } from '@/theme/tokens';

export interface ActivePlanCardProps {
  activePlan: PlanAggregate | null;
  suggestedDay: PlanDay | null;
  onStart: (planDayId: string) => void;
  isStarting?: boolean | undefined;
  onChangeDay: (planId: string) => void;
  onOpenPlan: (planId: string) => void;
  onGoToPlans: () => void;
  testID?: string | undefined;
}

/**
 * Home's first card - the active plan's suggested next day
 * (`nextSuggestedPlanDay`, P10 decision 2) plus the entry point into
 * `plan-day-picker` for the case where the suggestion isn't what the user
 * wants to start. Three real states, not one component with a single
 * generic "empty" fallback: no active plan at all, an active plan with zero
 * days (nothing to suggest), and the normal suggested-day case.
 */
export function ActivePlanCard({
  activePlan,
  suggestedDay,
  onStart,
  isStarting,
  onChangeDay,
  onOpenPlan,
  onGoToPlans,
  testID,
}: ActivePlanCardProps) {
  if (!activePlan) {
    return (
      <Card variant="elevated" testID={testID}>
        <EmptyState
          illustration={<Ionicons name="clipboard-outline" size={40} color={color.textTertiary} />}
          title={t('home.activePlan.emptyTitle')}
          message={t('home.activePlan.emptyMessage')}
          actionLabel={t('home.activePlan.goToPlansButtonLabel')}
          onAction={onGoToPlans}
          testID={testID ? `${testID}-empty` : undefined}
        />
      </Card>
    );
  }

  if (!suggestedDay) {
    return (
      <Card variant="elevated" testID={testID}>
        <Column gap={3}>
          <Text variant="label" color="secondary">
            {t('home.activePlan.title')}
          </Text>
          <Text variant="title3" color="primary" numberOfLines={1}>
            {activePlan.name}
          </Text>
          <Text variant="body" color="secondary">
            {t('home.activePlan.noDaysMessageTemplate', { name: activePlan.name })}
          </Text>
          <Button
            variant="secondary"
            label={t('home.activePlan.openPlanButtonLabel')}
            onPress={() => onOpenPlan(activePlan.id)}
            testID={testID ? `${testID}-open-plan-button` : undefined}
          />
        </Column>
      </Card>
    );
  }

  return (
    <Card variant="elevated" testID={testID}>
      <Column gap={3}>
        <Text variant="label" color="secondary">
          {t('home.activePlan.title')}
        </Text>
        <Column gap={1}>
          <Text variant="title3" color="primary" numberOfLines={1}>
            {activePlan.name}
          </Text>
          <Text variant="body" color="secondary" numberOfLines={1}>
            {t('home.activePlan.suggestedDayLabelTemplate', { name: suggestedDay.name })}
          </Text>
        </Column>
        <Row gap={2}>
          <Button
            variant="primary"
            label={t('home.activePlan.startButtonLabelTemplate', { name: suggestedDay.name })}
            onPress={() => onStart(suggestedDay.id)}
            loading={isStarting}
            testID={testID ? `${testID}-start-button` : undefined}
          />
          {activePlan.days.length > 1 ? (
            <Button
              variant="ghost"
              label={t('home.activePlan.changeDayButtonLabel')}
              onPress={() => onChangeDay(activePlan.id)}
              testID={testID ? `${testID}-change-day-button` : undefined}
            />
          ) : null}
        </Row>
      </Column>
    </Card>
  );
}
