import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { router, Stack } from 'expo-router';

import { Column, Row, Screen } from '@/components/layout';
import { Button, StepperField, Text, TextField } from '@/components/ui';
import { BottomSheet, EmptyState, ErrorState, Skeleton } from '@/components/feedback';
import { DraggableList } from '@/components/gestures/DraggableList';
import { EXERCISE_REST_SECONDS_MAX, formatExerciseName } from '@/features/exercise-library';
import type { PlanDayExercise } from '@/features/plans';
import { PlanValidationError, SupersetMinimumSizeError } from '@/features/plans';
import { haptics } from '@/services/haptics';
import { t } from '@/i18n';
import { routes } from '@/navigation/routes';
import { useExercisePickerStore } from '@/stores/exercisePickerStore';
import { useToastStore } from '@/stores/toastStore';
import { color, space } from '@/theme/tokens';

import { PlanDayExerciseRow } from '../components/PlanDayExerciseRow';
import { SupersetGroupEditor } from '../components/SupersetGroupEditor';
import {
  useAddExerciseToDay,
  useRemoveDayExercise,
  useRestoreDayExercise,
  useSetSupersetGroup,
  useUpdateDayExercise,
} from '../hooks/useDayExerciseMutations';
import { usePlan } from '../hooks/usePlan';
import { useReorderDayExercises } from '../hooks/useReorderDayExercises';

const ROW_HEIGHT = 76;

export interface PlanDayEditorScreenProps {
  planId: string | undefined;
  dayId: string | undefined;
}

function nextSupersetGroup(exercises: readonly PlanDayExercise[]): number {
  const groups = exercises
    .map((exercise) => exercise.supersetGroup)
    .filter((group): group is number => group !== null);
  return groups.length === 0 ? 1 : Math.max(...groups) + 1;
}

/**
 * `app/(tabs)/plans/[planId]/day/[dayId].tsx`'s screen body. There is no
 * dedicated `getDay()` on `PlanService` (ARCHITECTURE.md section 8.3 only
 * defines a whole-plan `getPlan()`), so this screen reads through
 * `usePlan(planId)` the same as `PlanDetailScreen` and finds its own day
 * inside `plan.days` - keeping one cache entry (`planKeys.detail(planId)`)
 * as the single source of truth for the whole aggregate, rather than a
 * second query that would need its own invalidation wiring.
 */
export function PlanDayEditorScreen({ planId, dayId }: PlanDayEditorScreenProps) {
  const { data: plan, isPending, isError, refetch } = usePlan(planId);
  const addExerciseToDay = useAddExerciseToDay();
  const updateDayExercise = useUpdateDayExercise();
  const removeDayExercise = useRemoveDayExercise();
  const restoreDayExercise = useRestoreDayExercise();
  const reorderDayExercises = useReorderDayExercises();
  const setSupersetGroup = useSetSupersetGroup();

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editTarget, setEditTarget] = useState<PlanDayExercise | null>(null);
  const [editDraft, setEditDraft] = useState<{
    targetSets: number | null;
    targetRepMin: number | null;
    targetRepMax: number | null;
    targetRpe: number | null;
    restSeconds: number | null;
    note: string;
  } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const day = plan?.days.find((candidate) => candidate.id === dayId);

  useEffect(() => {
    // `accessibilityLiveRegion="polite"` on the count `Text` below (which is
    // the only mechanism this file relied on before this fix) is
    // Android-only - VoiceOver has no equivalent, so a selection change
    // would go unannounced on iOS. Mirrors the fix already applied to
    // Toast/ErrorState/TextField for the identical gap (accessibility audit
    // A11Y-002, reports/accessibility-2026-08-05-p1.md).
    if (!selectMode) {
      return;
    }
    AccessibilityInfo.announceForAccessibility(
      t('plans.day.selectedCountLabel', { count: selectedIds.size }),
    );
  }, [selectMode, selectedIds]);

  function toggleSelectMode() {
    setSelectMode((current) => !current);
    setSelectedIds(new Set());
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function openEditSheet(dayExercise: PlanDayExercise) {
    setEditTarget(dayExercise);
    setEditError(null);
    setEditDraft({
      targetSets: dayExercise.targetSets,
      targetRepMin: dayExercise.targetRepMin,
      targetRepMax: dayExercise.targetRepMax,
      targetRpe: dayExercise.targetRpe,
      restSeconds: dayExercise.restSeconds,
      note: dayExercise.note ?? '',
    });
  }

  function closeEditSheet() {
    setEditTarget(null);
    setEditDraft(null);
  }

  async function handleSaveEdit() {
    if (!editTarget || !editDraft) return;
    setEditError(null);
    try {
      await updateDayExercise.mutateAsync({
        id: editTarget.id,
        patch: {
          targetSets: editDraft.targetSets,
          targetRepMin: editDraft.targetRepMin,
          targetRepMax: editDraft.targetRepMax,
          targetRpe: editDraft.targetRpe,
          restSeconds: editDraft.restSeconds,
          note: editDraft.note.trim() === '' ? null : editDraft.note,
        },
      });
      closeEditSheet();
    } catch (error) {
      if (error instanceof PlanValidationError) {
        setEditError(error.issues[0]?.message ?? t('plans.day.genericErrorMessage'));
      } else {
        setEditError(t('plans.day.genericErrorMessage'));
      }
    }
  }

  function handleRemove(dayExercise: PlanDayExercise) {
    haptics.destructive();
    const name = formatExerciseName({
      nameEn: dayExercise.exercise.nameEn,
      namePl: dayExercise.exercise.namePl,
      displayNameOverride: dayExercise.exercise.displayNameOverride,
    });
    removeDayExercise.mutate(dayExercise.id);
    useToastStore.getState().show({
      message: t('plans.day.removeUndoMessageTemplate', { name }),
      actionLabel: t('common.undo'),
      onAction: () => restoreDayExercise.mutate(dayExercise.id),
    });
  }

  function handleUngroup(dayExercise: PlanDayExercise) {
    haptics.select();
    setSupersetGroup.mutate({ dayExerciseIds: [dayExercise.id], group: null });
  }

  async function handleGroupSelected() {
    if (!day) return;
    try {
      await setSupersetGroup.mutateAsync({
        dayExerciseIds: Array.from(selectedIds),
        group: nextSupersetGroup(day.exercises),
      });
      haptics.select();
      setSelectMode(false);
      setSelectedIds(new Set());
    } catch (error) {
      if (error instanceof SupersetMinimumSizeError) {
        useToastStore.getState().show({ message: t('plans.day.supersetMinimumErrorMessage') });
      } else {
        useToastStore.getState().show({ message: t('plans.day.genericErrorMessage') });
      }
    }
  }

  function handleAddExercise() {
    if (!day) return;
    useExercisePickerStore.getState().open({
      alreadySelectedIds: day.exercises.map((exercise) => exercise.exerciseId),
      onConfirm: (selectedExerciseIds) => {
        selectedExerciseIds.forEach((exerciseId) => {
          addExerciseToDay.mutate({ dayId: day.id, input: { exerciseId } });
        });
      },
    });
    router.push(routes.modals.exercisePicker());
  }

  if (isPending) {
    return (
      <Screen testID="plan-day-editor-screen" scroll>
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
      <Screen testID="plan-day-editor-screen">
        <ErrorState error={t('plans.day.loadErrorMessage')} onRetry={() => refetch()} />
      </Screen>
    );
  }

  if (!plan || !day) {
    return (
      <Screen testID="plan-day-editor-screen">
        <ErrorState error={t('plans.day.notFoundMessage')} />
      </Screen>
    );
  }

  return (
    <Screen testID="plan-day-editor-screen" padded={false} edges={['bottom']}>
      <Stack.Screen options={{ title: day.name }} />
      <Column gap={3} style={{ flex: 1 }}>
        <Row
          justify="space-between"
          align="center"
          style={{ paddingHorizontal: space[4], paddingTop: space[3] }}
        >
          <Text variant="footnote" color="secondary">
            {t('plans.detail.exerciseCountLabel', { count: day.exercises.length })}
          </Text>
          {day.exercises.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              label={selectMode ? t('plans.day.cancelSelectButtonLabel') : t('plans.day.selectButtonLabel')}
              onPress={toggleSelectMode}
              testID="plan-day-select-toggle"
            />
          ) : null}
        </Row>

        <View style={{ flex: 1 }}>
          {day.exercises.length === 0 ? (
            <EmptyState
              illustration={<Ionicons name="barbell-outline" size={48} color={color.textTertiary} />}
              title={t('plans.day.emptyTitle')}
              message={t('plans.day.emptyMessage')}
              actionLabel={t('plans.day.addExerciseButtonLabel')}
              onAction={handleAddExercise}
              testID="plan-day-empty-state"
            />
          ) : (
            <DraggableList
              data={day.exercises}
              keyExtractor={(dayExercise) => dayExercise.id}
              rowHeight={ROW_HEIGHT}
              dragHandle="handle"
              onReorder={(orderedIds) =>
                reorderDayExercises.mutate({ planId: plan.id, dayId: day.id, orderedIds })
              }
              renderItem={(dayExercise, _index, dragHandle) => {
                const row = (
                  <PlanDayExerciseRow
                    dayExercise={dayExercise}
                    selectMode={selectMode}
                    selected={selectedIds.has(dayExercise.id)}
                    onToggleSelected={() => toggleSelected(dayExercise.id)}
                    onPress={() => openEditSheet(dayExercise)}
                    onRemove={() => handleRemove(dayExercise)}
                    onUngroup={
                      dayExercise.supersetGroup !== null
                        ? () => handleUngroup(dayExercise)
                        : undefined
                    }
                    dragHandle={dragHandle}
                    testID={`plan-day-exercise-row-${dayExercise.id}`}
                  />
                );
                return dayExercise.supersetGroup !== null ? (
                  <SupersetGroupEditor
                    group={dayExercise.supersetGroup}
                    testID={`superset-group-${dayExercise.supersetGroup}-${dayExercise.id}`}
                  >
                    {row}
                  </SupersetGroupEditor>
                ) : (
                  row
                );
              }}
              testID="plan-day-exercise-list"
            />
          )}
        </View>

        {!selectMode ? (
          <View style={{ paddingHorizontal: space[4], paddingBottom: space[4] }}>
            <Button
              variant="secondary"
              label={t('plans.day.addExerciseButtonLabel')}
              onPress={handleAddExercise}
              fullWidth
              testID="plan-day-add-exercise-button"
            />
          </View>
        ) : (
          <View
            style={{
              paddingHorizontal: space[4],
              paddingVertical: space[3],
              borderTopWidth: 1,
              borderTopColor: color.border,
            }}
          >
            <Row justify="space-between" align="center" gap={3}>
              <Text variant="footnote" color="secondary" accessibilityLiveRegion="polite">
                {t('plans.day.selectedCountLabel', { count: selectedIds.size })}
              </Text>
              <Button
                variant="primary"
                label={t('plans.day.groupButtonLabel')}
                onPress={() => void handleGroupSelected()}
                disabled={selectedIds.size < 2}
                loading={setSupersetGroup.isPending}
                testID="plan-day-group-button"
              />
            </Row>
          </View>
        )}
      </Column>

      <BottomSheet
        visible={editTarget !== null}
        onDismiss={closeEditSheet}
        snapPoints={[0.65]}
        testID="plan-day-exercise-edit-sheet"
      >
        {editDraft ? (
          <Column gap={4} style={{ paddingTop: space[2] }}>
            <Text variant="title3" color="primary">
              {t('plans.day.editSheetTitle')}
            </Text>

            <Row justify="space-between" align="center">
              <Text variant="body" color="primary">
                {t('plans.day.targetSetsLabel')}
              </Text>
              <StepperField
                value={editDraft.targetSets}
                onChange={(value) => setEditDraft((draft) => draft && { ...draft, targetSets: value })}
                min={1}
                max={50}
                accessibilityLabel={t('plans.day.targetSetsLabel')}
                testID="plan-day-edit-sets"
              />
            </Row>

            <Row justify="space-between" align="center">
              <Text variant="body" color="primary">
                {t('plans.day.targetRepsLabel')}
              </Text>
              <Row gap={2} align="center">
                <StepperField
                  value={editDraft.targetRepMin}
                  onChange={(value) =>
                    setEditDraft((draft) => draft && { ...draft, targetRepMin: value })
                  }
                  min={1}
                  accessibilityLabel={t('plans.day.targetRepsLabel')}
                  testID="plan-day-edit-rep-min"
                />
                <Text color="tertiary">{'-'}</Text>
                <StepperField
                  value={editDraft.targetRepMax}
                  onChange={(value) =>
                    setEditDraft((draft) => draft && { ...draft, targetRepMax: value })
                  }
                  min={1}
                  accessibilityLabel={t('plans.day.targetRepsLabel')}
                  testID="plan-day-edit-rep-max"
                />
              </Row>
            </Row>

            <Row justify="space-between" align="center">
              <Text variant="body" color="primary">
                {t('plans.day.targetRpeLabel')}
              </Text>
              <StepperField
                value={editDraft.targetRpe}
                onChange={(value) => setEditDraft((draft) => draft && { ...draft, targetRpe: value })}
                step={0.5}
                min={1}
                max={10}
                precision={1}
                accessibilityLabel={t('plans.day.targetRpeLabel')}
                testID="plan-day-edit-rpe"
              />
            </Row>

            <Row justify="space-between" align="center">
              <Text variant="body" color="primary">
                {t('plans.day.restOverrideLabel')}
              </Text>
              <StepperField
                value={editDraft.restSeconds}
                onChange={(value) =>
                  setEditDraft((draft) => draft && { ...draft, restSeconds: value })
                }
                step={15}
                min={1}
                max={EXERCISE_REST_SECONDS_MAX}
                unitSuffix={t('plans.day.restUnitSuffix')}
                accessibilityLabel={t('plans.day.restOverrideLabel')}
                testID="plan-day-edit-rest"
              />
            </Row>

            <TextField
              label={t('plans.day.noteLabel')}
              value={editDraft.note}
              onChangeText={(value) => setEditDraft((draft) => draft && { ...draft, note: value })}
              placeholder={t('plans.day.notePlaceholder')}
              testID="plan-day-edit-note"
            />

            {editError ? (
              <Text
                variant="caption"
                color="danger"
                accessibilityLiveRegion="polite"
                accessibilityRole="alert"
              >
                {editError}
              </Text>
            ) : null}

            <Button
              variant="primary"
              label={t('common.save')}
              onPress={() => void handleSaveEdit()}
              loading={updateDayExercise.isPending}
              fullWidth
              testID="plan-day-edit-save"
            />
          </Column>
        ) : null}
      </BottomSheet>
    </Screen>
  );
}
