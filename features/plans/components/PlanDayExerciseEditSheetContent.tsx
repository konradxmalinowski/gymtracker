import { useState } from 'react';

import { Column, Row } from '@/components/layout';
import { Button, StepperField, Text, TextField } from '@/components/ui';
import { EXERCISE_REST_SECONDS_MAX } from '@/features/exercise-library';
import { PlanValidationError, type PlanDayExercise } from '@/features/plans';
import { t } from '@/i18n';
import { useSheetStore } from '@/stores/sheetStore';
import { space } from '@/theme/tokens';

import { useUpdateDayExercise } from '../hooks/useDayExerciseMutations';

export interface PlanDayExerciseEditSheetContentProps {
  dayExercise: PlanDayExercise;
}

interface EditDraft {
  targetSets: number | null;
  targetRepMin: number | null;
  targetRepMax: number | null;
  targetRpe: number | null;
  restSeconds: number | null;
  note: string;
}

/**
 * Rendered inside the app-root `SheetHost`/`BottomSheet` (`present()`d from
 * `PlanDayEditorScreen`). Takes the tapped `dayExercise` as a fixed prop
 * (unlike `PlanNameSheetContent`/`PlanDetailNameSheetContent`, nothing here
 * needs to change once the sheet is open beyond this component's own local
 * draft state) and owns `editDraft`/`editError` plus the `useUpdateDayExercise`
 * mutation directly - same "sheet content owns whatever can change while it's
 * open" shape those two components already establish.
 */
export function PlanDayExerciseEditSheetContent({ dayExercise }: PlanDayExerciseEditSheetContentProps) {
  const [editDraft, setEditDraft] = useState<EditDraft>({
    targetSets: dayExercise.targetSets,
    targetRepMin: dayExercise.targetRepMin,
    targetRepMax: dayExercise.targetRepMax,
    targetRpe: dayExercise.targetRpe,
    restSeconds: dayExercise.restSeconds,
    note: dayExercise.note ?? '',
  });
  const [editError, setEditError] = useState<string | null>(null);
  const updateDayExercise = useUpdateDayExercise();
  const dismiss = useSheetStore((state) => state.dismissCurrent);

  async function handleSaveEdit() {
    setEditError(null);
    try {
      await updateDayExercise.mutateAsync({
        id: dayExercise.id,
        patch: {
          targetSets: editDraft.targetSets,
          targetRepMin: editDraft.targetRepMin,
          targetRepMax: editDraft.targetRepMax,
          targetRpe: editDraft.targetRpe,
          restSeconds: editDraft.restSeconds,
          note: editDraft.note.trim() === '' ? null : editDraft.note,
        },
      });
      dismiss();
    } catch (error) {
      if (error instanceof PlanValidationError) {
        setEditError(error.issues[0]?.message ?? t('plans.day.genericErrorMessage'));
      } else {
        setEditError(t('plans.day.genericErrorMessage'));
      }
    }
  }

  return (
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
          onChange={(value) => setEditDraft((draft) => ({ ...draft, targetSets: value }))}
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
            onChange={(value) => setEditDraft((draft) => ({ ...draft, targetRepMin: value }))}
            min={1}
            accessibilityLabel={t('plans.day.targetRepsLabel')}
            testID="plan-day-edit-rep-min"
          />
          <Text color="tertiary">{'-'}</Text>
          <StepperField
            value={editDraft.targetRepMax}
            onChange={(value) => setEditDraft((draft) => ({ ...draft, targetRepMax: value }))}
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
          onChange={(value) => setEditDraft((draft) => ({ ...draft, targetRpe: value }))}
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
          onChange={(value) => setEditDraft((draft) => ({ ...draft, restSeconds: value }))}
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
        onChangeText={(value) => setEditDraft((draft) => ({ ...draft, note: value }))}
        placeholder={t('plans.day.notePlaceholder')}
        testID="plan-day-edit-note"
      />

      {editError ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite" accessibilityRole="alert">
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
  );
}
