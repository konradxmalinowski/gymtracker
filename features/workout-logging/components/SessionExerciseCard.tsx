import { Column } from '@/components/layout';
import { Card, Divider } from '@/components/ui';
import {
  assignSetDisplayNumbers,
  orderSetsForDisplay,
  type SessionExercise,
  type UpdateSetPatch,
  type WorkoutSet,
} from '@/features/workout-logging';
import { space } from '@/theme/tokens';

import { AddSetButton } from './AddSetButton';
import { ExerciseHeader } from './ExerciseHeader';
import { PreviousPerformancePanel } from './PreviousPerformancePanel';
import { SetRow } from './SetRow';

export interface SessionExerciseCardProps {
  exercise: SessionExercise;
  canMoveUp: boolean;
  canMoveDown: boolean;
  focusedSetId: string | null;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onUpdateNote: (note: string | null) => void;
  onFocusSet: (setId: string) => void;
  onCompleteSet: (set: WorkoutSet) => void;
  onUncompleteSet: (setId: string) => void;
  onUpdateSet: (setId: string, patch: UpdateSetPatch) => void;
  onDeleteSet: (set: WorkoutSet) => void;
  onAddDropSet: (parentSetId: string) => void;
  onAddSet: () => void;
  isAddingSet: boolean;
  testID?: string | undefined;
}

/**
 * `SessionExerciseCard` from ARCHITECTURE.md section 10.3: `ExerciseHeader`,
 * `PreviousPerformancePanel`, the set list (drop segments rendered indented
 * under their parent via `orderSetsForDisplay`/`assignSetDisplayNumbers` from
 * the feature barrel, not re-derived here), `AddSetButton`. One card is one
 * `FlashList` item in `ActiveWorkoutScreen` - sets inside are a plain mapped
 * list, never their own virtualized list, per the same section's explicit
 * "nested virtualized lists are a known source of scroll jank" note.
 */
export function SessionExerciseCard({
  exercise,
  canMoveUp,
  canMoveDown,
  focusedSetId,
  onMoveUp,
  onMoveDown,
  onRemove,
  onUpdateNote,
  onFocusSet,
  onCompleteSet,
  onUncompleteSet,
  onUpdateSet,
  onDeleteSet,
  onAddDropSet,
  onAddSet,
  isAddingSet,
  testID,
}: SessionExerciseCardProps) {
  const orderedSets = orderSetsForDisplay(exercise.sets);
  const displayNumbers = assignSetDisplayNumbers(exercise.sets);

  return (
    <Card variant="elevated" padding={4} testID={testID}>
      <Column gap={3}>
        <ExerciseHeader
          exercise={exercise}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onRemove={onRemove}
          onUpdateNote={onUpdateNote}
          testID={testID ? `${testID}-header` : undefined}
        />

        <PreviousPerformancePanel testID={testID ? `${testID}-previous-performance` : undefined} />

        {orderedSets.length > 0 ? (
          <Column style={{ marginHorizontal: -space[2] }}>
            {orderedSets.map((workoutSet, index) => {
              const displayNumber = displayNumbers.get(workoutSet.id);
              if (!displayNumber) {
                return null;
              }
              return (
                <Column key={workoutSet.id}>
                  {index > 0 ? <Divider /> : null}
                  <SetRow
                    set={workoutSet}
                    displayNumber={displayNumber}
                    isFocused={focusedSetId === workoutSet.id}
                    onFocus={onFocusSet}
                    onComplete={onCompleteSet}
                    onUncomplete={onUncompleteSet}
                    onUpdate={onUpdateSet}
                    onDelete={onDeleteSet}
                    onAddDropSet={onAddDropSet}
                    testID={testID ? `${testID}-set-${workoutSet.id}` : undefined}
                  />
                </Column>
              );
            })}
          </Column>
        ) : null}

        <AddSetButton
          onPress={onAddSet}
          loading={isAddingSet}
          testID={testID ? `${testID}-add-set` : undefined}
        />
      </Column>
    </Card>
  );
}
