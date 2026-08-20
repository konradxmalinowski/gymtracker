import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

import { Column, Row, Screen } from '@/components/layout';
import { Button } from '@/components/ui';
import { EmptyState, ErrorState, Skeleton, ConfirmDialog } from '@/components/feedback';
import { DraggableList } from '@/components/gestures/DraggableList';
import type { PlanListItem } from '@/features/plans';
import { haptics } from '@/services/haptics';
import { t } from '@/i18n';
import { routes } from '@/navigation/routes';
import { useSheetStore } from '@/stores/sheetStore';
import { color, space } from '@/theme/tokens';

import { PlanCard } from '../components/PlanCard';
import { PlanNameSheetContent } from '../components/PlanNameSheetContent';
import { useDeletePlan, useDuplicatePlan, useSetActivePlan } from '../hooks/usePlanMutations';
import { usePlans } from '../hooks/usePlans';
import { useReorderPlans } from '../hooks/useReorderPlans';

const ROW_HEIGHT = 72;
const PLAN_NAME_SHEET_ID = 'plan-name';

/** `app/(tabs)/plans/index.tsx`'s screen body. */
export function PlanListScreen() {
  const { data, isPending, isError, refetch } = usePlans();
  const reorderPlans = useReorderPlans();
  const setActivePlan = useSetActivePlan();
  const duplicatePlan = useDuplicatePlan();
  const deletePlan = useDeletePlan();

  const [deleteTarget, setDeleteTarget] = useState<PlanListItem | null>(null);

  function openCreateSheet() {
    useSheetStore.getState().present({
      id: PLAN_NAME_SHEET_ID,
      content: <PlanNameSheetContent mode="create" />,
      snapPoints: [0.4],
    });
  }

  function openRenameSheet(plan: PlanListItem) {
    useSheetStore.getState().present({
      id: PLAN_NAME_SHEET_ID,
      content: <PlanNameSheetContent mode="rename" planId={plan.id} initialName={plan.name} />,
      snapPoints: [0.4],
    });
  }

  function handleToggleActive(plan: PlanListItem) {
    if (plan.isActive) {
      return;
    }
    haptics.select();
    setActivePlan.mutate(plan.id);
  }

  function handleDuplicate(plan: PlanListItem) {
    haptics.select();
    duplicatePlan.mutate(plan.id);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) {
      return;
    }
    const target = deleteTarget;
    setDeleteTarget(null);
    haptics.destructive();
    await deletePlan.mutateAsync(target.id);
  }

  return (
    <Screen testID="plan-list-screen" padded={false} edges={['top', 'bottom']}>
      <Column gap={3} style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          {isPending ? (
            <PlanListSkeleton />
          ) : isError ? (
            <ErrorState error={t('plans.list.loadErrorMessage')} onRetry={() => refetch()} />
          ) : !data || data.length === 0 ? (
            <EmptyState
              illustration={
                <Ionicons name="clipboard-outline" size={48} color={color.textTertiary} />
              }
              title={t('plans.list.emptyTitle')}
              message={t('plans.list.emptyMessage')}
              actionLabel={t('plans.list.createButtonLabel')}
              onAction={openCreateSheet}
              testID="plan-list-empty-state"
            />
          ) : (
            <DraggableList
              data={data}
              keyExtractor={(plan) => plan.id}
              rowHeight={ROW_HEIGHT}
              dragHandle="handle"
              onReorder={(orderedIds) => reorderPlans.mutate(orderedIds)}
              renderItem={(plan, _index, dragHandle) => (
                <PlanCard
                  plan={plan}
                  dragHandle={dragHandle}
                  onPress={() => router.push(routes.plans.detail(plan.id))}
                  onToggleActive={() => handleToggleActive(plan)}
                  onRename={() => openRenameSheet(plan)}
                  onDuplicate={() => handleDuplicate(plan)}
                  onDelete={() => setDeleteTarget(plan)}
                  testID={`plan-card-${plan.id}`}
                />
              )}
              testID="plan-list"
            />
          )}
        </View>

        {data && data.length > 0 ? (
          <View style={{ paddingHorizontal: space[4], paddingBottom: space[4] }}>
            <Button
              variant="primary"
              label={t('plans.list.createButtonLabel')}
              onPress={openCreateSheet}
              fullWidth
              testID="plan-list-create-button"
            />
          </View>
        ) : null}
      </Column>

      <ConfirmDialog
        visible={deleteTarget !== null}
        title={t('plans.list.deleteConfirmTitle')}
        message={t('plans.list.deleteConfirmMessageTemplate', { name: deleteTarget?.name ?? '' })}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setDeleteTarget(null)}
        testID="plan-delete-confirm-dialog"
      />
    </Screen>
  );
}

function PlanListSkeleton() {
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
