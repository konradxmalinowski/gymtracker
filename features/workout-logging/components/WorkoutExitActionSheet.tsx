import { Column } from '@/components/layout';
import { BottomSheet, Button, Text } from '@/components/ui';
import { t } from '@/i18n';
import { space } from '@/theme/tokens';

export interface WorkoutExitActionSheetProps {
  visible: boolean;
  onDismiss: () => void;
  onMinimize: () => void;
  onFinish: () => void;
  onDiscard: () => void;
  isFinishing: boolean;
  testID?: string | undefined;
}

/**
 * ADR-0007 rule 1 / this phase's brief: the Android hardware back button
 * intercepted inside `ActiveWorkoutScreen` shows this Minimize/Finish/
 * Discard choice instead of popping the route - reusing `components/feedback`
 * primitives (`BottomSheet`, `Button`) rather than a raw `Alert`, matching
 * the project's existing feedback-component vocabulary. `onDiscard` here is
 * already the fully-resolved trigger; `ActiveWorkoutScreen` decides whether
 * `shouldConfirmDiscard()` interposes its own `ConfirmDialog` before this
 * sheet's Discard button actually calls the service.
 */
export function WorkoutExitActionSheet({
  visible,
  onDismiss,
  onMinimize,
  onFinish,
  onDiscard,
  isFinishing,
  testID,
}: WorkoutExitActionSheetProps) {
  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} snapPoints={[0.4]} testID={testID}>
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
          onPress={onDismiss}
          fullWidth
          testID={testID ? `${testID}-cancel` : undefined}
        />
      </Column>
    </BottomSheet>
  );
}
