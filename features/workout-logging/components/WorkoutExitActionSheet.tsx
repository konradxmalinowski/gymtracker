import { Column } from '@/components/layout';
import { Button, Text } from '@/components/ui';
import { t } from '@/i18n';
import { space } from '@/theme/tokens';

export interface WorkoutExitActionSheetContentProps {
  onMinimize: () => void;
  onFinish: () => void;
  onDiscard: () => void;
  onCancel: () => void;
  isFinishing: boolean;
  testID?: string | undefined;
}

/**
 * ADR-0007 rule 1 / this phase's brief: the Android hardware back button
 * intercepted inside `ActiveWorkoutScreen` shows this Minimize/Finish/
 * Discard choice instead of popping the route - reusing `components/feedback`
 * primitives (`Button`) rather than a raw `Alert`, matching the project's
 * existing feedback-component vocabulary. `onDiscard` here is already the
 * fully-resolved trigger; `ActiveWorkoutScreen` decides whether
 * `shouldConfirmDiscard()` interposes its own `ConfirmDialog` before this
 * sheet's Discard button actually calls the service.
 *
 * Presented via `sheetStore` from `ActiveWorkoutScreen`'s `BackHandler`
 * listener (see that file's `handleExitSheetOpen`/hardware-back effect) -
 * migrated off a local inline `<BottomSheet visible/onDismiss>` embed for the
 * same reason `SetTypePickerSheetContent`/`PlateCalculatorSheetContent`
 * already are (CLAUDE.md's Post-P12 bugfix pass): a `<BottomSheet>` mounted
 * as a sibling inside `ActiveWorkoutScreen` rather than at the app root only
 * positions correctly by accident. This component therefore no longer owns
 * a `BottomSheet` wrapper or a `visible`/`onDismiss` pair - the wrapper now
 * lives in the root `SheetHost`, and `onCancel` is the fully-resolved
 * "dismiss this sheet" action the presenter wires to `dismissCurrent()`,
 * same split `SetTypePickerSheetContent.onSelect` uses.
 */
export function WorkoutExitActionSheet({
  onMinimize,
  onFinish,
  onDiscard,
  onCancel,
  isFinishing,
  testID,
}: WorkoutExitActionSheetContentProps) {
  return (
    <Column gap={3} style={{ paddingTop: space[2] }}>
      <Text variant="title3" color="primary">
        {t('workoutLogging.active.exitSheetTitle')}
      </Text>
      <Button
        variant="secondary"
        label={t('workoutLogging.active.minimizeActionLabel')}
        onPress={onMinimize}
        fullWidth
        testID={testID ? `${testID}-minimize` : undefined}
      />
      <Button
        variant="primary"
        label={t('workoutLogging.active.finishActionLabel')}
        onPress={onFinish}
        loading={isFinishing}
        fullWidth
        testID={testID ? `${testID}-finish` : undefined}
      />
      <Button
        variant="destructive"
        label={t('workoutLogging.active.discardActionLabel')}
        onPress={onDiscard}
        fullWidth
        testID={testID ? `${testID}-discard` : undefined}
      />
      <Button
        variant="ghost"
        label={t('workoutLogging.active.cancelActionLabel')}
        onPress={onCancel}
        fullWidth
        testID={testID ? `${testID}-cancel` : undefined}
      />
    </Column>
  );
}
