import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { View } from 'react-native';

import { Column, Row } from '@/components/layout';
import { IconButton, ListRow, Surface, Text, TextField } from '@/components/ui';
import { PressScale } from '@/components/gestures/PressScale';
import { formatExerciseName } from '@/features/exercise-library';
import type { SessionExercise } from '@/features/workout-logging';
import { t } from '@/i18n';
import { useSheetStore } from '@/stores/sheetStore';
import { color, space } from '@/theme/tokens';

import { ExerciseThumbnail } from './ExerciseThumbnail';
import { useDebouncedFieldCommit } from '../hooks/useDebouncedFieldCommit';

interface ExerciseActionsSheetContentProps {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onOpenPlateCalculator: () => void;
}

/**
 * Reference-layout pass: the four separate move-up/move-down/note/remove
 * icon buttons that used to sit in `ExerciseHeader`'s own action cluster are
 * replaced by one three-dot overflow trigger opening this sheet - this app
 * has no dropdown/popover-menu primitive (the same gap `WorkoutHeader.tsx`'s
 * own discard-icon comment already notes), so a sheetStore-presented list of
 * `ListRow`s is this codebase's established stand-in, matching
 * `WorkoutExitActionSheet`'s own shape for the same reason. The note toggle
 * moved onto an inline "Add notes..." placeholder instead (see the render
 * below) since it's the row's own primary, always-visible affordance in the
 * reference, not an occasional overflow action.
 */
function ExerciseActionsSheetContent({
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onRemove,
  onOpenPlateCalculator,
}: ExerciseActionsSheetContentProps) {
  return (
    <Column gap={4}>
      <Text variant="title3" color="primary">
        {t('workoutLogging.active.exerciseActionsSheetTitle')}
      </Text>
      <Surface level={1} radius="lg">
        <ListRow
          title={t('workoutLogging.active.moveExerciseUpActionLabel')}
          leading={<Ionicons name="chevron-up" size={20} color={color.textSecondary} />}
          onPress={onMoveUp}
          disabled={!canMoveUp}
          testID="exercise-actions-move-up"
        />
        <ListRow
          title={t('workoutLogging.active.moveExerciseDownActionLabel')}
          leading={<Ionicons name="chevron-down" size={20} color={color.textSecondary} />}
          onPress={onMoveDown}
          disabled={!canMoveDown}
          testID="exercise-actions-move-down"
        />
        <ListRow
          title={t('workoutLogging.plateCalculator.title')}
          leading={<Ionicons name="barbell-outline" size={20} color={color.textSecondary} />}
          onPress={onOpenPlateCalculator}
          testID="exercise-actions-plate-calculator"
        />
        <ListRow
          title={t('workoutLogging.active.removeExerciseActionLabel')}
          leading={<Ionicons name="close-circle-outline" size={20} color={color.danger} />}
          onPress={onRemove}
          destructive
          testID="exercise-actions-remove"
        />
      </Surface>
    </Column>
  );
}

export interface ExerciseHeaderProps {
  exercise: SessionExercise;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  /** FR-16 exercise-level note - `setExerciseNote(sessionExerciseId, note)` through `useSetExerciseNote`. `null` clears it. */
  onUpdateNote: (note: string | null) => void;
  /** Gravitus-inspired refresh's plate calculator, relocated from the card's own always-visible row into this overflow sheet - declutters the card to match the reference layout. */
  onOpenPlateCalculator: () => void;
  testID?: string | undefined;
}

/**
 * `ExerciseHeader` from ARCHITECTURE.md section 10.3 - name, superset bracket
 * (rendered by `SupersetBracket` wrapping the whole card, not here), a note
 * button, and an overflow-equivalent remove-exercise action.
 *
 * The note button toggles an inline editor below the row, the same
 * contained, no-modal shape `SetRow`'s own expanded editor uses (ADR-0007
 * rule 4: "editing a set is inline ... never a modal") - kept entirely
 * inside this component rather than lifted to `SessionExerciseCard`, since
 * nothing outside this row needs to know whether the editor is open.
 *
 * Reordering is move-up/move-down icon buttons, not a drag handle -
 * `DraggableList` needs a fixed row height and a card's height varies with
 * its set count, so the accessible non-gesture path is used directly (see
 * `useReorderExercises`'s file header for the fuller reasoning).
 */
export function ExerciseHeader({
  exercise,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onRemove,
  onUpdateNote,
  onOpenPlateCalculator,
  testID,
}: ExerciseHeaderProps) {
  const [noteExpanded, setNoteExpanded] = useState(false);
  const [noteDraft, setNoteDraft] = useDebouncedFieldCommit(exercise.note ?? '', (note) =>
    onUpdateNote(note.trim() === '' ? null : note),
  );

  const name = formatExerciseName({
    nameEn: exercise.exercise.nameEn,
    namePl: exercise.exercise.namePl,
    displayNameOverride: exercise.exercise.displayNameOverride,
  });
  const hasNote = exercise.note !== null && exercise.note.trim() !== '';

  function openActionsSheet() {
    useSheetStore.getState().present({
      id: `exercise-actions-${exercise.id}`,
      content: (
        <ExerciseActionsSheetContent
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          onMoveUp={() => {
            useSheetStore.getState().dismissCurrent();
            onMoveUp();
          }}
          onMoveDown={() => {
            useSheetStore.getState().dismissCurrent();
            onMoveDown();
          }}
          onRemove={() => {
            useSheetStore.getState().dismissCurrent();
            onRemove();
          }}
          onOpenPlateCalculator={() => {
            useSheetStore.getState().dismissCurrent();
            onOpenPlateCalculator();
          }}
        />
      ),
      snapPoints: [0.35],
    });
  }

  return (
    <View testID={testID}>
      <Row gap={3} align="center">
        <ExerciseThumbnail primaryImage={exercise.exercise.primaryImage} />

        <Column gap={1} style={{ flex: 1 }}>
          <Text variant="bodyMedium" color="accent" numberOfLines={1}>
            {name}
          </Text>
        </Column>

        <IconButton
          icon={<Ionicons name="ellipsis-vertical" size={18} color={color.textTertiary} />}
          variant="ghost"
          size="sm"
          accessibilityLabel={t('workoutLogging.active.exerciseActionsAccessibilityLabelTemplate', {
            name,
          })}
          onPress={openActionsSheet}
          testID={testID ? `${testID}-actions` : undefined}
        />
      </Row>

      {/* Reference-layout pass: an inline tappable placeholder replaces the
          old chat-bubble icon toggle - it's this row's own primary
          affordance in the reference, not an occasional overflow action, so
          it reads as a real (empty) field rather than a hidden control. */}
      {!noteExpanded ? (
        <PressScale
          onPress={() => setNoteExpanded(true)}
          accessibilityRole="button"
          accessibilityLabel={t('workoutLogging.active.noteAccessibilityLabelTemplate', { name })}
          style={{ paddingTop: space[1] }}
          testID={testID ? `${testID}-note-toggle` : undefined}
        >
          <Text variant="footnote" color={hasNote ? 'secondary' : 'tertiary'} numberOfLines={1}>
            {hasNote ? exercise.note : t('workoutLogging.set.notePlaceholder')}
          </Text>
        </PressScale>
      ) : (
        <View style={{ paddingTop: space[2] }}>
          <TextField
            label={t('workoutLogging.set.noteLabel')}
            value={noteDraft}
            onChangeText={setNoteDraft}
            placeholder={t('workoutLogging.set.notePlaceholder')}
            testID={testID ? `${testID}-note-field` : undefined}
          />
        </View>
      )}
    </View>
  );
}
