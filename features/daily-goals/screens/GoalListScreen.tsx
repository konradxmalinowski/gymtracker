import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { router } from 'expo-router';

import { Column, Row, Screen } from '@/components/layout';
import { Button, IconButton } from '@/components/ui';
import { EmptyState, ErrorState, Skeleton, ConfirmDialog } from '@/components/feedback';
import { DraggableList } from '@/components/gestures/DraggableList';
import { haptics } from '@/services/haptics';
import { t } from '@/i18n';
import { routes } from '@/navigation/routes';
import { color, space } from '@/theme/tokens';

import { GoalCard } from '../components/GoalCard';
import {
  useAllGoals,
  useDeleteGoal,
  useReorderGoals,
  useSetGoalEnabled,
} from '../hooks/useDailyGoals';
import type { DailyGoal } from '../types/DailyGoal';

const ROW_HEIGHT = 76;

/**
 * `app/(tabs)/goals/manage/index.tsx`'s screen body - every goal, enabled or not
 * (`useAllGoals`, not `useTodaysGoals`), with reorder, edit, enable/disable,
 * and delete. Mirrors `PlanListScreen`'s exact shape (`DraggableList` +
 * `dragHandle="handle"` + a `ConfirmDialog`-gated hard delete) - the closest
 * precedent for a top-level, standalone-object management list in this
 * codebase.
 */
export function GoalListScreen() {
  const { data, isPending, isError, refetch } = useAllGoals();
  const reorderGoals = useReorderGoals();
  const setGoalEnabled = useSetGoalEnabled();
  const deleteGoal = useDeleteGoal();

  const [deleteTarget, setDeleteTarget] = useState<DailyGoal | null>(null);

  useEffect(() => {
    if (isPending) {
      AccessibilityInfo.announceForAccessibility(t('common.loading'));
    } else if (!isError && data && data.length === 0) {
      AccessibilityInfo.announceForAccessibility(t('dailyGoals.manage.emptyTitle'));
    }
  }, [isPending, isError, data]);

  function handleToggleEnabled(goal: DailyGoal, isEnabled: boolean) {
    haptics.select();
    setGoalEnabled.mutate({ id: goal.id, isEnabled });
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) {
      return;
    }
    const target = deleteTarget;
    setDeleteTarget(null);
    haptics.destructive();
    await deleteGoal.mutateAsync(target.id);
  }

  return (
    <Screen testID="goal-list-screen" padded={false} edges={['bottom']}>
      <Column gap={3} style={{ flex: 1 }}>
        <Row
          justify="space-between"
          align="center"
          style={{ paddingHorizontal: space[4], paddingTop: space[3] }}
        >
          <Button
            variant="ghost"
            size="sm"
            label={t('dailyGoals.manage.remindersButtonLabel')}
            icon={<Ionicons name="notifications-outline" size={16} color={color.accentText} />}
            onPress={() => router.push(routes.goals.reminders())}
            testID="goal-list-reminders-button"
          />
          <IconButton
            icon={<Ionicons name="add" size={22} color={color.textPrimary} />}
            variant="default"
            accessibilityLabel={t('dailyGoals.manage.createButtonLabel')}
            onPress={() => router.push(routes.goals.create())}
            testID="goal-list-create-button"
          />
        </Row>

        <View style={{ flex: 1 }}>
          {isPending ? (
            <GoalListSkeleton />
          ) : isError ? (
            <ErrorState error={t('dailyGoals.manage.loadErrorMessage')} onRetry={() => refetch()} />
          ) : !data || data.length === 0 ? (
            <EmptyState
              illustration={<Ionicons name="flag-outline" size={48} color={color.textTertiary} />}
              title={t('dailyGoals.manage.emptyTitle')}
              message={t('dailyGoals.manage.emptyMessage')}
              actionLabel={t('dailyGoals.manage.createButtonLabel')}
              onAction={() => router.push(routes.goals.create())}
              testID="goal-list-empty-state"
            />
          ) : (
            <DraggableList
              data={data}
              keyExtractor={(goal) => goal.id}
              rowHeight={ROW_HEIGHT}
              dragHandle="handle"
              onReorder={(orderedIds) => reorderGoals.mutate(orderedIds)}
              renderItem={(goal, _index, dragHandle) => (
                <GoalCard
                  goal={goal}
                  dragHandle={dragHandle}
                  onPress={() => router.push(routes.goals.edit(goal.id))}
                  onToggleEnabled={(isEnabled) => handleToggleEnabled(goal, isEnabled)}
                  onDelete={() => setDeleteTarget(goal)}
                  testID={`goal-card-${goal.id}`}
                />
              )}
              testID="goal-list"
            />
          )}
        </View>
      </Column>

      <ConfirmDialog
        visible={deleteTarget !== null}
        title={t('dailyGoals.manage.deleteConfirmTitle')}
        message={t('dailyGoals.manage.deleteConfirmMessageTemplate', {
          name: deleteTarget?.name ?? '',
        })}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setDeleteTarget(null)}
        testID="goal-delete-confirm-dialog"
      />
    </Screen>
  );
}

function GoalListSkeleton() {
  return (
    <Column gap={4} style={{ padding: space[4] }}>
      {[0, 1, 2, 3].map((index) => (
        <Row key={index} gap={3} align="center">
          <Skeleton width={32} height={32} radius="full" />
          <Column gap={2} style={{ flex: 1 }}>
            <Skeleton width="60%" height={16} />
            <Skeleton width="30%" height={12} />
          </Column>
        </Row>
      ))}
    </Column>
  );
}
