import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { router } from 'expo-router';

import { Column } from '@/components/layout';
import { Button, NumberField, Text } from '@/components/ui';
import { ErrorState, Skeleton } from '@/components/feedback';
import { DailyGoalValidationError } from '@/features/daily-goals';
import { t } from '@/i18n';
import { useContainer } from '@/services/container';
import { space } from '@/theme/tokens';

import { useGoal, useRecordGoalProgress } from '../hooks/useDailyGoals';

export interface GoalProgressEntryScreenProps {
  goalId: string;
}

/**
 * `app/(modals)/goal-progress-entry.tsx`'s screen body - a `numeric` goal's
 * "add an exact amount" quick action (`DailyGoalsScreen`'s own Add button).
 * Mirrors `RestTimerSettings`'s shape for a small, single-purpose modal form
 * reached with a plain route-param id, closest available precedent since
 * this codebase's own `body-metric-entry` modal (named in this feature's
 * brief) does not actually exist on disk - body-metrics' equivalent quick
 * entry is sheet-based (`MeasurementQuickEntrySheetContent`), not a modal
 * route. This stays a real `(modals)` route per the brief's own explicit
 * instruction rather than silently switching to a sheet.
 *
 * Deliberately does not prefill `valueDraft` from today's existing progress
 * - same "start blank, don't guess" precedent
 * `MeasurementQuickEntrySheetContent` already establishes for its own
 * numeric quick entry.
 */
export function GoalProgressEntryScreen({ goalId }: GoalProgressEntryScreenProps) {
  const { clock } = useContainer();
  const goal = useGoal(goalId);
  const recordProgress = useRecordGoalProgress();
  const [valueDraft, setValueDraft] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (goal.isPending) {
      AccessibilityInfo.announceForAccessibility(t('common.loading'));
    }
  }, [goal.isPending]);

  async function handleSubmit() {
    setFormError(null);
    if (valueDraft === null || valueDraft <= 0) {
      setFormError(t('dailyGoals.progressEntry.valueRequiredError'));
      return;
    }
    try {
      await recordProgress.mutateAsync({
        goalId,
        localDate: clock.localDate(),
        progressValue: valueDraft,
      });
      router.back();
    } catch (error) {
      if (error instanceof DailyGoalValidationError) {
        setFormError(error.issues[0]?.message ?? t('dailyGoals.progressEntry.genericErrorMessage'));
      } else {
        setFormError(t('dailyGoals.progressEntry.genericErrorMessage'));
      }
    }
  }

  if (goal.isPending) {
    return (
      <Column gap={4} style={{ paddingVertical: space[4] }}>
        <Skeleton width="60%" height={24} />
        <Skeleton width="100%" height={48} />
      </Column>
    );
  }

  if (goal.isError || !goal.data) {
    return (
      <ErrorState error={t('dailyGoals.form.loadErrorMessage')} onRetry={() => goal.refetch()} />
    );
  }

  return (
    <Column gap={4} style={{ paddingVertical: space[2] }}>
      <Text variant="title3" color="primary">
        {t('dailyGoals.progressEntry.titleTemplate', { name: goal.data.name })}
      </Text>
      <NumberField
        value={valueDraft}
        onChange={setValueDraft}
        step={1}
        min={0}
        precision={1}
        unitSuffix={goal.data.unit ?? undefined}
        selectOnFocus
        accessibilityLabel={t('dailyGoals.progressEntry.valueAccessibilityLabel')}
        testID="goal-progress-entry-value-field"
      />
      {formError ? (
        <Text variant="footnote" color="danger" accessibilityLiveRegion="polite">
          {formError}
        </Text>
      ) : null}
      <Button
        variant="primary"
        label={t('dailyGoals.progressEntry.saveButtonLabel')}
        onPress={() => void handleSubmit()}
        loading={recordProgress.isPending}
        fullWidth
        testID="goal-progress-entry-save"
      />
    </Column>
  );
}
