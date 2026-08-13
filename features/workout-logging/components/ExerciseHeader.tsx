import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { View } from 'react-native';

import { Column, Row } from '@/components/layout';
import { IconButton, Text, TextField } from '@/components/ui';
import { formatExerciseName } from '@/features/exercise-library';
import type { SessionExercise } from '@/features/workout-logging';
import { t } from '@/i18n';
import { color, space } from '@/theme/tokens';

import { ExerciseThumbnail } from './ExerciseThumbnail';
import { useDebouncedFieldCommit } from '../hooks/useDebouncedFieldCommit';

export interface ExerciseHeaderProps {
  exercise: SessionExercise;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  /** FR-16 exercise-level note - `setExerciseNote(sessionExerciseId, note)` through `useSetExerciseNote`. `null` clears it. */
  onUpdateNote: (note: string | null) => void;
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

  return (
    <View testID={testID}>
      <Row gap={3} align="center">
        <ExerciseThumbnail primaryImage={exercise.exercise.primaryImage} />

        <Column gap={1} style={{ flex: 1 }}>
          <Text variant="bodyMedium" color="primary" numberOfLines={1}>
            {name}
          </Text>
        </Column>

        <Row gap={1} align="center">
          <IconButton
            icon={
              <Ionicons
                name={hasNote ? 'chatbubble' : 'chatbubble-outline'}
                size={18}
                color={hasNote ? color.accent : color.textTertiary}
              />
            }
            variant="ghost"
            size="sm"
            accessibilityLabel={t('workoutLogging.active.noteAccessibilityLabelTemplate', { name })}
            onPress={() => setNoteExpanded((current) => !current)}
            testID={testID ? `${testID}-note-toggle` : undefined}
          />
          <IconButton
            icon={<Ionicons name="chevron-up" size={18} color={color.textTertiary} />}
            variant="ghost"
            size="sm"
            disabled={!canMoveUp}
            accessibilityLabel={t(
              'workoutLogging.active.moveExerciseUpAccessibilityLabelTemplate',
              {
                name,
              },
            )}
            onPress={onMoveUp}
            testID={testID ? `${testID}-move-up` : undefined}
          />
          <IconButton
            icon={<Ionicons name="chevron-down" size={18} color={color.textTertiary} />}
            variant="ghost"
            size="sm"
            disabled={!canMoveDown}
            accessibilityLabel={t(
              'workoutLogging.active.moveExerciseDownAccessibilityLabelTemplate',
              {
                name,
              },
            )}
            onPress={onMoveDown}
            testID={testID ? `${testID}-move-down` : undefined}
          />
          <IconButton
            icon={<Ionicons name="close-circle-outline" size={18} color={color.danger} />}
            variant="ghost"
            size="sm"
            accessibilityLabel={t(
              'workoutLogging.active.removeExerciseAccessibilityLabelTemplate',
              {
                name,
              },
            )}
            onPress={onRemove}
            testID={testID ? `${testID}-remove` : undefined}
          />
        </Row>
      </Row>

      {noteExpanded ? (
        <View style={{ paddingTop: space[2] }}>
          <TextField
            label={t('workoutLogging.set.noteLabel')}
            value={noteDraft}
            onChangeText={setNoteDraft}
            placeholder={t('workoutLogging.set.notePlaceholder')}
            testID={testID ? `${testID}-note-field` : undefined}
          />
        </View>
      ) : null}
    </View>
  );
}
