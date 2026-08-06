import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { View } from 'react-native';
import { router, Stack } from 'expo-router';

import { Column, Screen } from '@/components/layout';
import { Button, TextField } from '@/components/ui';
import { BottomSheet, EmptyState, ErrorState, Skeleton } from '@/components/feedback';
import { DraggableList } from '@/components/gestures/DraggableList';
import type { PlanDay } from '@/features/plans';
import { PlanValidationError } from '@/features/plans';
import { haptics } from '@/services/haptics';
import { t } from '@/i18n';
import { routes } from '@/navigation/routes';
import { useToastStore } from '@/stores/toastStore';
import { color, space } from '@/theme/tokens';

import { PlanDayCard } from '../components/PlanDayCard';
import { PlanEditorHeader } from '../components/PlanEditorHeader';
import { useAddDay, useDeleteDay, useDuplicateDay, useRenameDay, useRestoreDay } from '../hooks/useDayMutations';
import { usePlan } from '../hooks/usePlan';
import { useRenamePlan, useSetActivePlan } from '../hooks/usePlanMutations';
import { useReorderDays } from '../hooks/useReorderDays';

const ROW_HEIGHT = 72;

type SheetState =
  | { kind: 'closed' }
  | { kind: 'renamePlan' }
  | { kind: 'addDay' }
  | { kind: 'renameDay'; day: PlanDay };

export interface PlanDetailScreenProps {
  planId: string | undefined;
}

/** `app/(tabs)/plans/[planId].tsx`'s screen body. */
export function PlanDetailScreen({ planId }: PlanDetailScreenProps) {
  const { data: plan, isPending, isError, refetch } = usePlan(planId);
  const renamePlan = useRenamePlan();
  const setActivePlan = useSetActivePlan();
  const addDay = useAddDay();
  const renameDay = useRenameDay();
  const duplicateDay = useDuplicateDay();
  const deleteDay = useDeleteDay();
  const restoreDay = useRestoreDay();
  const reorderDays = useReorderDays();

  const [sheet, setSheet] = useState<SheetState>({ kind: 'closed' });
  const [nameInput, setNameInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  function closeSheet() {
    setSheet({ kind: 'closed' });
  }

  function openRenamePlanSheet() {
    if (!plan) return;
    setNameInput(plan.name);
    setFormError(null);
    setSheet({ kind: 'renamePlan' });
  }

  function openAddDaySheet() {
    setNameInput('');
    setFormError(null);
    setSheet({ kind: 'addDay' });
  }

  function openRenameDaySheet(day: PlanDay) {
    setNameInput(day.name);
    setFormError(null);
    setSheet({ kind: 'renameDay', day });
  }

  async function handleSubmitSheet() {
    if (!plan) return;
    setFormError(null);
    try {
      if (sheet.kind === 'renamePlan') {
        await renamePlan.mutateAsync({ id: plan.id, name: nameInput });
      } else if (sheet.kind === 'addDay') {
        await addDay.mutateAsync({ planId: plan.id, input: { name: nameInput } });
      } else if (sheet.kind === 'renameDay') {
        await renameDay.mutateAsync({ dayId: sheet.day.id, name: nameInput });
      }
      closeSheet();
    } catch (error) {
      if (error instanceof PlanValidationError) {
        setFormError(error.issues[0]?.message ?? t('plans.detail.genericErrorMessage'));
      } else {
        setFormError(t('plans.detail.genericErrorMessage'));
      }
    }
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

      <BottomSheet visible={sheet.kind !== 'closed'} onDismiss={closeSheet} snapPoints={[0.4]}>
        <Column gap={4} style={{ paddingTop: space[2] }}>
          <TextField
            label={
              sheet.kind === 'renamePlan'
                ? t('plans.list.renameDialogTitle')
                : sheet.kind === 'renameDay'
                  ? t('plans.detail.renameDayDialogTitle')
                  : t('plans.detail.addDayDialogTitle')
            }
            value={nameInput}
            onChangeText={setNameInput}
            placeholder={
              sheet.kind === 'addDay' || sheet.kind === 'renameDay'
                ? t('plans.detail.dayNamePlaceholder')
                : t('plans.list.namePlaceholder')
            }
            error={formError ?? undefined}
            testID="plan-detail-name-sheet-field"
          />
          <Button
            variant="primary"
            label={t('common.save')}
            onPress={() => void handleSubmitSheet()}
            loading={renamePlan.isPending || addDay.isPending || renameDay.isPending}
            fullWidth
            testID="plan-detail-name-sheet-save"
          />
        </Column>
      </BottomSheet>
    </Screen>
  );
}
