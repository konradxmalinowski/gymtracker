import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { BackHandler, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';

import { Column } from '@/components/layout';
import { ConfirmDialog, EmptyState, Skeleton } from '@/components/feedback';
import { RestTimerBar, useRestTimerTick } from '@/features/rest-timer';
import type { SessionExercise, WorkoutSet } from '@/features/workout-logging';
import { t } from '@/i18n';
import { routes } from '@/navigation/routes';
import { useContainer } from '@/services/container';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';
import { useRestTimerStore } from '@/stores/restTimerStore';
import { color, space } from '@/theme/tokens';

import { AddExerciseButton } from '../components/AddExerciseButton';
import { QuickAdjustBar } from '../components/QuickAdjustBar';
import { SessionExerciseCard } from '../components/SessionExerciseCard';
import { SupersetBracket } from '../components/SupersetBracket';
import { WorkoutExitActionSheet } from '../components/WorkoutExitActionSheet';
import { WorkoutHeader } from '../components/WorkoutHeader';
import { useActiveSessionHydration } from '../hooks/useActiveSession';
import { useActiveStateSync } from '../hooks/useActiveStateSync';
import {
  useAddExercise,
  useRemoveExercise,
  useReorderExercises,
} from '../hooks/useExerciseMutations';
import { useFinishDiscardWorkout } from '../hooks/useFinishDiscardWorkout';
import { useSetExerciseNote, useSetSessionNotes } from '../hooks/useNotes';
import { useAdjustRestTimerDelta, useSkipRestTimer } from '../hooks/useRestTimer';
import {
  useAddDropSet,
  useAppendSet,
  useCompleteSet,
  useDeleteSet,
  useUncompleteSet,
  useUpdateSet,
} from '../hooks/useSetMutations';

function findSet(exercises: readonly SessionExercise[], setId: string | null): WorkoutSet | null {
  if (!setId) {
    return null;
  }
  for (const exercise of exercises) {
    const found = exercise.sets.find((candidate) => candidate.id === setId);
    if (found) {
      return found;
    }
  }
  return null;
}

/**
 * `workout/active`'s screen body (ARCHITECTURE.md section 10.3):
 * `WorkoutHeader`, `RestTimerBar`, `FlashList<SessionExerciseCard>`,
 * `QuickAdjustBar`, `AddExerciseButton`. `RestTimerBar` is P7's addition -
 * always mounted (it self-hides when no timer is running, the same pattern
 * `ActiveWorkoutBanner` already uses), sitting directly under the header per
 * section 10.3's documented composition order.
 *
 * `useRestTimerTick(clock)` is mounted here unconditionally too, not only
 * while a timer happens to be running - a cheap `setInterval` write to a
 * single store field either way, and starting/stopping it around a timer's
 * lifetime would be strictly more moving parts for no real cost saved.
 *

 * Owns: the ADR-0008 mount-time hydration (`useActiveSessionHydration`), the
 * Android hardware-back interception (ADR-0007 rule 1 - `BackHandler` lives
 * here, not in `app/workout/_layout.tsx`, because the exit choice needs
 * `sessionService`/the store, which a router-config file has no business
 * holding), and the discard confirmation gate (`shouldConfirmDiscard()`).
 *
 * The store is deliberately *not* cleared on this component's own unmount.
 * ADR-0008 rule 4 lists "finish, discard, unmount" together, but minimizing
 * (`handleMinimize`'s `router.back()`) unmounts this screen too - clearing
 * here unconditionally would wipe `activeWorkoutStore` the instant a user
 * minimizes, which is exactly the data `ActiveWorkoutBanner` needs to still
 * be populated. `useFinishDiscardWorkout`'s `clearAndExit` is the only clear
 * path in this phase; the "unmount" case in the ADR's rule 4 is read here as
 * covering a future, more disruptive kind of exit (e.g. a fatal navigation
 * reset) rather than the routine minimize-and-return flow this phase ships.
 */
export function ActiveWorkoutScreen() {
  useActiveSessionHydration();

  const { sessionService, clock } = useContainer();
  const session = useActiveWorkoutStore((state) => state.session);
  const isHydrated = useActiveWorkoutStore((state) => state.isHydrated);
  const focusedSetId = useActiveWorkoutStore((state) => state.focusedSetId);
  const setFocusedSetId = useActiveWorkoutStore((state) => state.setFocusedSetId);
  const runningTimerSessionExerciseId = useActiveWorkoutStore(
    (state) => state.runningTimerSessionExerciseId,
  );

  useRestTimerTick(clock);
  const restTimerDeadlineAt = useRestTimerStore((state) => state.deadlineAt);
  const restTimerTotalSeconds = useRestTimerStore((state) => state.totalSeconds);

  const [exitSheetVisible, setExitSheetVisible] = useState(false);
  const [discardConfirmVisible, setDiscardConfirmVisible] = useState(false);
  const [appendingExerciseId, setAppendingExerciseId] = useState<string | null>(null);

  const { finish, discard, isFinishing } = useFinishDiscardWorkout();
  const addExercise = useAddExercise();
  const removeExercise = useRemoveExercise();
  const reorderExercises = useReorderExercises();
  const appendSet = useAppendSet();
  const updateSet = useUpdateSet();
  const completeSet = useCompleteSet();
  const uncompleteSet = useUncompleteSet();
  const addDropSet = useAddDropSet();
  const deleteSet = useDeleteSet();
  const setExerciseNote = useSetExerciseNote();
  const setSessionNotes = useSetSessionNotes();
  const adjustRestTimer = useAdjustRestTimerDelta();
  const skipRestTimer = useSkipRestTimer();
  const { syncFocusedExercise, syncScrollOffset } = useActiveStateSync(session?.id);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setExitSheetVisible(true);
      return true;
    });
    return () => subscription.remove();
  }, []);

  if (!isHydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: color.background, padding: space[4] }}>
        <Column gap={4} style={{ paddingTop: space[6] }}>
          <Skeleton width="60%" height={28} />
          <Skeleton width="100%" height={160} radius="xl" />
          <Skeleton width="100%" height={160} radius="xl" />
        </Column>
      </View>
    );
  }

  if (!session) {
    return (
      <View style={{ flex: 1, backgroundColor: color.background }}>
        <EmptyState
          title={t('workoutLogging.active.emptyExercisesTitle')}
          message={t('workoutLogging.active.emptyExercisesMessage')}
          actionLabel={t('common.close')}
          onAction={() => router.replace(routes.tabs.home())}
          testID="active-workout-empty-state"
        />
      </View>
    );
  }

  // Rebinding to a fresh `const` (rather than using the `session` narrowed
  // above by the `if (!session)` guard) is deliberate: TypeScript's
  // control-flow narrowing does not carry into function declarations defined
  // later in this same component body (`handleDiscardRequest`,
  // `handleFocusSet`, `moveExercise` below), so every closure that touches
  // the session reads `activeSession`, which is non-null from the moment
  // it's declared.
  const activeSession = session;
  const focusedSet = findSet(activeSession.exercises, focusedSetId);
  const alreadySelectedIds = activeSession.exercises.map((exercise) => exercise.exerciseId);

  function handleMinimize() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(routes.tabs.home());
    }
  }

  async function handleDiscardRequest() {
    const requiresConfirm = await sessionService.shouldConfirmDiscard();
    if (requiresConfirm) {
      setDiscardConfirmVisible(true);
    } else {
      void discard(activeSession.id);
    }
  }

  function handleFocusSet(setId: string) {
    setFocusedSetId(setId);
    const owningExercise = activeSession.exercises.find((exercise) =>
      exercise.sets.some((candidate) => candidate.id === setId),
    );
    syncFocusedExercise(owningExercise?.id ?? null);
  }

  async function handleAddSet(sessionExerciseId: string) {
    setAppendingExerciseId(sessionExerciseId);
    await appendSet(sessionExerciseId);
    setAppendingExerciseId(null);
  }

  function handleOpenRestTimerSettings() {
    const targetId =
      runningTimerSessionExerciseId ?? activeSession.activeState.focusedSessionExerciseId;
    if (!targetId) {
      return;
    }
    router.push(routes.modals.restTimerSettings(targetId));
  }

  function moveExercise(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= activeSession.exercises.length) {
      return;
    }
    const orderedIds = activeSession.exercises.map((exercise) => exercise.id);
    const [moved] = orderedIds.splice(index, 1);
    if (moved === undefined) {
      return;
    }
    orderedIds.splice(nextIndex, 0, moved);
    reorderExercises(activeSession.id, orderedIds);
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.background }}>
      <WorkoutHeader
        title={activeSession.title}
        startedAt={activeSession.startedAt}
        pausedMs={activeSession.pausedMs}
        notes={activeSession.notes}
        onMinimize={handleMinimize}
        onFinish={() => void finish(activeSession.id)}
        onDiscard={() => void handleDiscardRequest()}
        onUpdateNotes={(notes) => void setSessionNotes(activeSession.id, notes)}
        isFinishing={isFinishing}
        testID="workout-header"
      />

      <RestTimerBar
        deadlineAt={restTimerDeadlineAt}
        totalSeconds={restTimerTotalSeconds}
        onAdjust={adjustRestTimer}
        onSkip={skipRestTimer}
        onOpenSettings={handleOpenRestTimerSettings}
        testID="rest-timer-bar"
      />

      <View style={{ flex: 1 }}>
        {activeSession.exercises.length === 0 ? (
          <EmptyState
            illustration={<Ionicons name="barbell-outline" size={48} color={color.textTertiary} />}
            title={t('workoutLogging.active.emptyExercisesTitle')}
            message={t('workoutLogging.active.emptyExercisesMessage')}
            testID="active-workout-no-exercises"
          />
        ) : (
          <FlashList
            data={activeSession.exercises}
            keyExtractor={(exercise) => exercise.id}
            onScroll={(event) => syncScrollOffset(event.nativeEvent.contentOffset.y)}
            scrollEventThrottle={250}
            contentContainerStyle={{ padding: space[4] }}
            renderItem={({ item: exercise, index }) => {
              const card = (
                <SessionExerciseCard
                  exercise={exercise}
                  canMoveUp={index > 0}
                  canMoveDown={index < activeSession.exercises.length - 1}
                  focusedSetId={focusedSetId}
                  onMoveUp={() => moveExercise(index, -1)}
                  onMoveDown={() => moveExercise(index, 1)}
                  onRemove={() => removeExercise(exercise)}
                  onUpdateNote={(note) => void setExerciseNote(exercise.id, note)}
                  onFocusSet={handleFocusSet}
                  onCompleteSet={completeSet}
                  onUncompleteSet={uncompleteSet}
                  onUpdateSet={updateSet}
                  onDeleteSet={deleteSet}
                  onAddDropSet={(parentSetId) => void addDropSet(parentSetId)}
                  onAddSet={() => void handleAddSet(exercise.id)}
                  isAddingSet={appendingExerciseId === exercise.id}
                  testID={`session-exercise-card-${exercise.id}`}
                />
              );
              return (
                <View style={{ marginBottom: space[3] }}>
                  {exercise.supersetGroup !== null ? (
                    <SupersetBracket
                      group={exercise.supersetGroup}
                      testID={`superset-bracket-${exercise.supersetGroup}-${exercise.id}`}
                    >
                      {card}
                    </SupersetBracket>
                  ) : (
                    card
                  )}
                </View>
              );
            }}
            testID="active-workout-exercise-list"
          />
        )}
      </View>

      <QuickAdjustBar
        focusedSet={focusedSet}
        onAdjustWeight={(nextWeightKg) =>
          focusedSet && updateSet(focusedSet.id, { weightKg: nextWeightKg })
        }
        onAdjustReps={(nextReps) => focusedSet && updateSet(focusedSet.id, { reps: nextReps })}
        testID="quick-adjust-bar"
      />

      <View style={{ padding: space[4], paddingTop: 0 }}>
        <AddExerciseButton
          alreadySelectedIds={alreadySelectedIds}
          onSelect={(exerciseIds) =>
            exerciseIds.forEach((exerciseId) => void addExercise(activeSession.id, exerciseId))
          }
          testID="active-workout-add-exercise-button"
        />
      </View>

      <WorkoutExitActionSheet
        visible={exitSheetVisible}
        onDismiss={() => setExitSheetVisible(false)}
        onMinimize={() => {
          setExitSheetVisible(false);
          handleMinimize();
        }}
        onFinish={() => {
          setExitSheetVisible(false);
          void finish(activeSession.id);
        }}
        onDiscard={() => {
          setExitSheetVisible(false);
          void handleDiscardRequest();
        }}
        isFinishing={isFinishing}
        testID="workout-exit-sheet"
      />

      <ConfirmDialog
        visible={discardConfirmVisible}
        title={t('workoutLogging.active.discardConfirmTitle')}
        message={t('workoutLogging.active.discardConfirmMessage')}
        confirmLabel={t('workoutLogging.active.discardButtonLabel')}
        destructive
        onConfirm={() => {
          setDiscardConfirmVisible(false);
          void discard(activeSession.id);
        }}
        onCancel={() => setDiscardConfirmVisible(false)}
        testID="workout-discard-confirm-dialog"
      />
    </View>
  );
}
