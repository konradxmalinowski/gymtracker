import { Column } from '@/components/layout';
import { Card, Divider } from '@/components/ui';
import {
  assignSetDisplayNumbers,
  orderSetsForDisplay,
  useProgressionSuggestion,
  type SessionExercise,
  type UpdateSetPatch,
  type WorkoutSet,
} from '@/features/workout-logging';
import { ProgressionHint, type PersonalRecord } from '@/features/records';
import { useContainer } from '@/services/container';
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
  /** P8: the most recently completed set's new PRs (`activeWorkoutStore.latestPR`), or `null` when nothing to show. Threaded down to whichever `SetRow` matches `setId`, mirroring how `focusedSetId` already flows through this same prop chain. */
  latestPR: { setId: string; records: readonly PersonalRecord[] } | null;
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
  latestPR,
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

  const { exerciseHistoryRepository, settings } = useContainer();
  const {
    previousPerformance,
    suggestion,
    isPending: isHistoryPending,
  } = useProgressionSuggestion(
    { exerciseHistoryRepository, settings },
    {
      exerciseId: exercise.exerciseId,
      primaryMuscleBodyPart: exercise.exercise.bodyPart,
      equipmentSlug: exercise.exercise.equipmentSlug,
      beforeSessionId: exercise.sessionId,
    },
  );

  // The apply affordance needs somewhere to write the suggestion to - the
  // first not-yet-completed set, the same "what am I about to do next"
  // reading a lifter would use. `undefined` (not a no-op handler) when there
  // is none, so `ProgressionHint` hides the affordance instead of rendering
  // an inert tap target (this phase's own brief: "disable or hide ... rather
  // than doing nothing silently on tap").
  const nextIncompleteSet = exercise.sets.find((candidate) => !candidate.isCompleted) ?? null;
  const handleApplySuggestion =
    nextIncompleteSet && suggestion && suggestion.kind !== 'first_time'
      ? () =>
          onUpdateSet(nextIncompleteSet.id, {
            weightKg: suggestion.weightKg,
            reps: suggestion.reps,
          })
      : undefined;

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

        <PreviousPerformancePanel
          previousPerformance={previousPerformance}
          isPending={isHistoryPending}
          testID={testID ? `${testID}-previous-performance` : undefined}
        />

        <ProgressionHint
          suggestion={suggestion}
          onApply={handleApplySuggestion}
          testID={testID ? `${testID}-progression-hint` : undefined}
        />

        {orderedSets.length > 0 ? (
          <Column style={{ marginHorizontal: -space[2] }}>
            {orderedSets.map((workoutSet, index) => {
              const displayNumber = displayNumbers.get(workoutSet.id);
              if (!displayNumber) {
                return null;
              }
              const prRecords: readonly PersonalRecord[] | undefined =
                latestPR?.setId === workoutSet.id ? latestPR.records : undefined;
              return (
                <Column key={workoutSet.id}>
                  {index > 0 ? <Divider /> : null}
                  <SetRow
                    set={workoutSet}
                    displayNumber={displayNumber}
                    isFocused={focusedSetId === workoutSet.id}
                    prRecords={prRecords}
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
