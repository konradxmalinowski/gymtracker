import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { router, Stack } from 'expo-router';

import { Column, Screen } from '@/components/layout';
import { Button } from '@/components/ui';
import { ConfirmDialog, EmptyState, ErrorState, Skeleton } from '@/components/feedback';
import { DraggableList } from '@/components/gestures/DraggableList';
import type { PlanDay } from '@/features/plans';
// P6: `useStartWorkout` is this barrel's one deliberate presentation-layer
// export (see its own doc comment in `features/workout-logging/index.ts`) -
// `plans` stays within the cross-feature-barrel-only rule (ARCHITECTURE.md
// section 3.1 rule 4) by importing only from `@/features/workout-logging`,
// never its internals.
import { useStartWorkout } from '@/features/workout-logging';
import { haptics } from '@/services/haptics';
import { t } from '@/i18n';
import { routes } from '@/navigation/routes';
import { useContainer } from '@/services/container';
import { useSheetStore } from '@/stores/sheetStore';
import { useToastStore } from '@/stores/toastStore';
import { color, space } from '@/theme/tokens';

import { PlanDayCard } from '../components/PlanDayCard';
import { PlanDetailNameSheetContent } from '../components/PlanDetailNameSheetContent';
import { PlanEditorHeader } from '../components/PlanEditorHeader';
import { useDeleteDay, useDuplicateDay, useRestoreDay } from '../hooks/useDayMutations';
import { usePlan } from '../hooks/usePlan';
import { useSetActivePlan } from '../hooks/usePlanMutations';
import { useReorderDays } from '../hooks/useReorderDays';

const ROW_HEIGHT = 72;
const PLAN_DETAIL_NAME_SHEET_ID = 'plan-detail-name';

export interface PlanDetailScreenProps {
  planId: string | undefined;
}

/** `app/(tabs)/plans/[planId].tsx`'s screen body. */
export function PlanDetailScreen({ planId }: PlanDetailScreenProps) {
  const { data: plan, isPending, isError, refetch } = usePlan(planId);
  const setActivePlan = useSetActivePlan();
  const duplicateDay = useDuplicateDay();
  const deleteDay = useDeleteDay();
  const restoreDay = useRestoreDay();
  const reorderDays = useReorderDays();
  const { sessionService } = useContainer();
  const { startFromPlanDay, isStarting, blockedSession, dismissBlocked, resumeBlocked } =
    useStartWorkout(sessionService);

  function openRenamePlanSheet() {
    if (!plan) return;
    useSheetStore.getState().present({
      id: PLAN_DETAIL_NAME_SHEET_ID,
      content: <PlanDetailNameSheetContent kind="renamePlan" planId={plan.id} initialName={plan.name} />,
      snapPoints: [0.4],
    });
  }

  function openAddDaySheet() {
    if (!plan) return;
    useSheetStore.getState().present({
      id: PLAN_DETAIL_NAME_SHEET_ID,
      content: <PlanDetailNameSheetContent kind="addDay" planId={plan.id} />,
      snapPoints: [0.4],
    });
  }

  function openRenameDaySheet(day: PlanDay) {
    if (!plan) return;
    useSheetStore.getState().present({
      id: PLAN_DETAIL_NAME_SHEET_ID,
      content: (
        <PlanDetailNameSheetContent
          kind="renameDay"
          planId={plan.id}
          dayId={day.id}
          initialName={day.name}
        />
      ),
      snapPoints: [0.4],
    });
  }

  function handleDuplicateDay(day: PlanDay) {
    haptics.select();
    duplicateDay.mutate(day.id);
  }

  function handleDeleteDay(day: PlanDay) {
    haptics.destructive();
    deleteDay.mutate(day.id);
    useToastStore.getState().show({
      message: t('plans.detail.deleteUndoMessageTemplate', { name: day.name }),
      actionLabel: t('common.undo'),
      onAction: () => restoreDay.mutate(day.id),
    });
  }

  if (isPending) {
    return (
      <Screen testID="plan-detail-screen" scroll>
        <Column gap={4} style={{ paddingVertical: space[4] }}>
          <Skeleton width="60%" height={28} />
          <Skeleton width="100%" height={64} />
          <Skeleton width="100%" height={64} />
        </Column>
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen testID="plan-detail-screen">
        <ErrorState error={t('plans.detail.loadErrorMessage')} onRetry={() => refetch()} />
      </Screen>
    );
  }

  if (!plan) {
    return (
      <Screen testID="plan-detail-screen">
        <ErrorState error={t('plans.detail.notFoundMessage')} />
      </Screen>
    );
  }

  return (
    <Screen testID="plan-detail-screen" padded={false} edges={['bottom']}>
      <Stack.Screen options={{ title: plan.name }} />
      <Column gap={3} style={{ flex: 1, paddingHorizontal: space[4], paddingTop: space[3] }}>
        <PlanEditorHeader
          plan={plan}
          onRename={openRenamePlanSheet}
          onSetActive={() => setActivePlan.mutate(plan.id)}
          testID="plan-detail-header"
        />

        <View style={{ flex: 1, marginHorizontal: -space[4] }}>
          {plan.days.length === 0 ? (
            <EmptyState
              illustration={<Ionicons name="list-outline" size={48} color={color.textTertiary} />}
              title={t('plans.detail.dayEmptyTitle')}
              message={t('plans.detail.dayEmptyMessage')}
              actionLabel={t('plans.detail.addDayButtonLabel')}
              onAction={openAddDaySheet}
              testID="plan-detail-day-empty-state"
            />
          ) : (
            <DraggableList
              data={plan.days}
              keyExtractor={(day) => day.id}
              rowHeight={ROW_HEIGHT}
              dragHandle="handle"
              onReorder={(orderedDayIds) =>
                reorderDays.mutate({ planId: plan.id, orderedDayIds })
              }
              renderItem={(day, _index, dragHandle) => (
                <PlanDayCard
                  day={day}
                  dragHandle={dragHandle}
                  onPress={() => router.push(routes.plans.day(plan.id, day.id))}
                  onRename={() => openRenameDaySheet(day)}
                  onDuplicate={() => handleDuplicateDay(day)}
                  onDelete={() => handleDeleteDay(day)}
                  onStart={isStarting ? undefined : () => void startFromPlanDay(day.id)}
                  testID={`plan-day-card-${day.id}`}
                />
              )}
              testID="plan-day-list"
            />
          )}
        </View>

        {plan.days.length > 0 ? (
          <View style={{ paddingBottom: space[4] }}>
            <Button
              variant="secondary"
              label={t('plans.detail.addDayButtonLabel')}
              onPress={openAddDaySheet}
              fullWidth
              testID="plan-detail-add-day-button"
            />
          </View>
        ) : null}
      </Column>

      {/* P6: `startFromPlanDay`'s `outcome: 'blocked'` result - a workout is
          already in progress, so this offers Resume (jumps into it) or
          Cancel rather than silently failing the tap. */}
      <ConfirmDialog
        visible={blockedSession !== null}
        title={t('plans.detail.startWorkoutBlockedTitle')}
        message={t('plans.detail.startWorkoutBlockedMessageTemplate', {
          title: blockedSession?.session.title ?? '',
        })}
        confirmLabel={t('plans.detail.startWorkoutResumeButtonLabel')}
        onConfirm={resumeBlocked}
        onCancel={dismissBlocked}
        testID="plan-detail-start-blocked-dialog"
      />
    </Screen>
  );
}
