import { router } from 'expo-router';

import { Button } from '@/components/ui';
import { t } from '@/i18n';
import { routes } from '@/navigation/routes';
import { useExercisePickerStore } from '@/stores/exercisePickerStore';

export interface AddExerciseButtonProps {
  alreadySelectedIds: readonly string[];
  onSelect: (exerciseIds: string[]) => void;
  testID?: string | undefined;
}

/**
 * Reuses `(modals)/exercise-picker` exactly as `navigation/routes.ts`'s file
 * header always said this phase would: open `exercisePickerStore` with an
 * `onConfirm` callback and navigate, precisely mirroring
 * `PlanDayEditorScreen.tsx`'s `handleAddExercise`. No second picker is built.
 */
export function AddExerciseButton({
  alreadySelectedIds,
  onSelect,
  testID,
}: AddExerciseButtonProps) {
  function handlePress() {
    useExercisePickerStore.getState().open({
      alreadySelectedIds,
      onConfirm: onSelect,
    });
    router.push(routes.modals.exercisePicker());
  }

  return (
    <Button
      variant="secondary"
      label={t('workoutLogging.active.addExerciseAccessibilityLabel')}
      onPress={handlePress}
      fullWidth
      testID={testID}
    />
  );
}
