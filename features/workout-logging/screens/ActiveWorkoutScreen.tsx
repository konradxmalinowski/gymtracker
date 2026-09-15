import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, View } from 'react-native';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

/** How long a `PRBadge` stays visible before `activeWorkoutStore.latestPR` self-clears - long enough to notice, short enough that it reads as "just happened" rather than a permanent tag on that set. */
const LATEST_PR_DISPLAY_MS = 4000;

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

  const insets = useSafeAreaInsets();
  const { sessionService, clock } = useContainer();
  const session = useActiveWorkoutStore((state) => state.session);
  const isHydrated = useActiveWorkoutStore((state) => state.isHydrated);
  const focusedSetId = useActiveWorkoutStore((state) => state.focusedSetId);
  const setFocusedSetId = useActiveWorkoutStore((state) => state.setFocusedSetId);
  const latestPR = useActiveWorkoutStore((state) => state.latestPR);
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

  // P8: `latestPR` is a one-shot celebratory badge, not persisted state - it
  // clears itself a few seconds after appearing rather than staying attached
  // to that set indefinitely. Keyed on `latestPR` itself (not just its
  // presence) so completing a *different* set that also earns a PR restarts
  // the timer for the new badge instead of the old timeout firing early.
  useEffect(() => {
    if (!latestPR) {
      return;
    }
    const timeout = setTimeout(() => {
      useActiveWorkoutStore.getState().clearLatestPR();
    }, LATEST_PR_DISPLAY_MS);
    return () => clearTimeout(timeout);
  }, [latestPR]);

  // --- Stable, identity-based mutation callbacks (P15: FlashList tuning +
  // memoization audit) ------------------------------------------------------
  //
  // Every callback below reads the session fresh via
  // `useActiveWorkoutStore.getState()` rather than closing over this render's
  // `session` - the store's own `session` object gets a new top-level
  // identity on every mutation (`patchSet`/`upsertSet`/... each return a new
  // `{ ...state.session, exercises: [...] }`), so a callback that closed
  // over it directly would itself get a new identity on every keystroke-
  // driven render, exactly the instability this pass exists to remove.
  // Reading through `getState()` at call time - the same pattern every hook
  // in `useSetMutations.ts`/`useExerciseMutations.ts` already uses - keeps
  // these `useCallback`s referentially stable for the entire lifetime of the
  // mutation hooks they close over (`reorderExercises`/`removeExercise`/
  // `setExerciseNote`/`appendSet`/`addDropSet`, each already stable per its
  // own hook's `useCallback([sessionService], ...)`). Declared before the
  // `isHydrated`/`session` early returns below, per the Rules of Hooks -
  // every one of them is written to tolerate a `null` session since they can
  // run on a render where `session` isn't hydrated yet, even though in
  // practice they're only ever invoked from an already-rendered row.
  const handleMoveExercise = useCallback(
    (exerciseId: string, direction: -1 | 1) => {
      const currentSession = useActiveWorkoutStore.getState().session;
      if (!currentSession) {
        return;
      }
      const index = currentSession.exercises.findIndex((candidate) => candidate.id === exerciseId);
      if (index === -1) {
        return;
      }
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= currentSession.exercises.length) {
        return;
      }
      const orderedIds = currentSession.exercises.map((candidate) => candidate.id);
      const [moved] = orderedIds.splice(index, 1);
      if (moved === undefined) {
        return;
      }
      orderedIds.splice(nextIndex, 0, moved);
      reorderExercises(currentSession.id, orderedIds);
    },
    [reorderExercises],
  );

  const handleRemoveExercise = useCallback(
    (exerciseId: string) => {
      const currentSession = useActiveWorkoutStore.getState().session;
      const exercise = currentSession?.exercises.find((candidate) => candidate.id === exerciseId);
      if (exercise) {
        removeExercise(exercise);
      }
    },
    [removeExercise],
  );

  const handleUpdateExerciseNote = useCallback(
    (exerciseId: string, note: string | null) => {
      void setExerciseNote(exerciseId, note);
    },
    [setExerciseNote],
  );

  const handleAddSetForExercise = useCallback(
    async (sessionExerciseId: string) => {
      setAppendingExerciseId(sessionExerciseId);
      await appendSet(sessionExerciseId);
      setAppendingExerciseId(null);
    },
    [appendSet],
  );

  const handleFocusSet = useCallback(
    (setId: string) => {
      setFocusedSetId(setId);
      const currentSession = useActiveWorkoutStore.getState().session;
      const owningExercise = currentSession?.exercises.find((exercise) =>
        exercise.sets.some((candidate) => candidate.id === setId),
      );
      syncFocusedExercise(owningExercise?.id ?? null);
    },
    [setFocusedSetId, syncFocusedExercise],
  );

  const handleAddDropSet = useCallback(
    (parentSetId: string) => {
      void addDropSet(parentSetId);
    },
    [addDropSet],
  );

  // A per-exercise-id map of the five callbacks `SessionExerciseCard` needs
  // (`onMoveUp`/`onMoveDown`/`onRemove`/`onUpdateNote`/`onAddSet`), rebuilt
  // only when the *set* of exercise ids actually changes (add/remove/reorder)
  // - never on a keystroke, a set completion, or any other edit that leaves
  // the exercise list itself untouched. This is what lets an unrelated
  // exercise's `SessionExerciseCard` see the exact same callback props across
  // such a render, which is what lets `renderItem`'s own memoization (below)
  // skip re-invoking for that row entirely - see
  // `node_modules/@shopify/flash-list/dist/recyclerview/ViewHolder.js`'s own
  // `useMemo(() => renderItem(...), [item, extraData, target, renderItem])`.
  // Keyed on `exerciseIdsKey` (a joined string of ids), not the `exercises`
  // array itself, precisely so a keystroke-driven `session` replacement -
  // which always produces a new `exercises` array reference even when no
  // exercise was added/removed/reordered - does not defeat this memo.
  const exerciseIdsKey = (session?.exercises ?? []).map((exercise) => exercise.id).join(' ');
  const exerciseHandlersById = useMemo(() => {
    const map = new Map<
      string,
      {
        onMoveUp: () => void;
        onMoveDown: () => void;
        onRemove: () => void;
        onUpdateNote: (note: string | null) => void;
        onAddSet: () => void;
      }
    >();
    for (const exercise of session?.exercises ?? []) {
      map.set(exercise.id, {
        onMoveUp: () => handleMoveExercise(exercise.id, -1),
        onMoveDown: () => handleMoveExercise(exercise.id, 1),
        onRemove: () => handleRemoveExercise(exercise.id),
        onUpdateNote: (note) => handleUpdateExerciseNote(exercise.id, note),
        onAddSet: () => void handleAddSetForExercise(exercise.id),
      });
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately keyed on `exerciseIdsKey` (the id list's content), not `session`/`session.exercises` (a fresh reference on every keystroke-driven mutation) - see this block's own comment above.
  }, [
    exerciseIdsKey,
    handleMoveExercise,
    handleRemoveExercise,
    handleUpdateExerciseNote,
    handleAddSetForExercise,
  ]);

  // Recreated only when `focusedSetId`/`latestPR` actually change, not on
  // every render - an inline `{ focusedSetId, latestPR }` literal here would
  // be a fresh object every render regardless of whether either value
  // changed, which would defeat `renderItem`'s own memoization below just as
  // completely as an unstable `renderItem` reference would (FlashList's
  // `ViewHolder` treats `extraData` and `renderItem` as two independent,
  // reference-compared props - see the comment above `exerciseHandlersById`).
  const extraData = useMemo(() => ({ focusedSetId, latestPR }), [focusedSetId, latestPR]);

  const exerciseCount = session?.exercises.length ?? 0;

  // Hoisted out of the `<FlashList>` JSX and wrapped in `useCallback` -
  // CLAUDE.md's own tracked "Known gap": as an inline arrow function, this
  // was a fresh reference on every `ActiveWorkoutScreen` render, which is
  // the actual reason `extraData` wasn't load-bearing yet (FlashList's
  // `ViewHolder` bails on calling `renderItem` only when `item`/`extraData`/
  // `target`/`renderItem` are ALL referentially unchanged - an unstable
  // `renderItem` alone was enough to force every cell to re-render on every
  // parent render, `extraData` or not). With `renderItem` and `extraData`
  // both now stable, and `exerciseHandlersById` giving every untouched
  // exercise the exact same callback props render over render, an unrelated
  // card no longer repaints when a sibling card's own set/field changes.
  const renderItem: ListRenderItem<SessionExercise> = useCallback(
    ({ item: exercise, index }) => {
      const handlers = exerciseHandlersById.get(exercise.id);
      if (!handlers) {
        // Cannot happen in practice - `exerciseHandlersById` is built from
        // the same `session.exercises` FlashList's own `data` prop is - but
        // `Map#get` is typed to return `undefined`, so this stays type-safe
        // rather than asserting past it.
        return null;
      }
      const card = (
        <SessionExerciseCard
          exercise={exercise}
          canMoveUp={index > 0}
          canMoveDown={index < exerciseCount - 1}
          focusedSetId={focusedSetId}
          latestPR={latestPR}
          onMoveUp={handlers.onMoveUp}
          onMoveDown={handlers.onMoveDown}
          onRemove={handlers.onRemove}
          onUpdateNote={handlers.onUpdateNote}
          onFocusSet={handleFocusSet}
          onCompleteSet={completeSet}
          onUncompleteSet={uncompleteSet}
          onUpdateSet={updateSet}
          onDeleteSet={deleteSet}
          onAddDropSet={handleAddDropSet}
          onAddSet={handlers.onAddSet}
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
    },
    [
      exerciseCount,
      exerciseHandlersById,
      focusedSetId,
      latestPR,
      appendingExerciseId,
      handleFocusSet,
      completeSet,
      uncompleteSet,
      updateSet,
      deleteSet,
      handleAddDropSet,
    ],
  );

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
  // `handleOpenRestTimerSettings` below), so every closure that touches the
  // session reads `activeSession`, which is non-null from the moment it's
  // declared. The stable, identity-based mutation callbacks above
  // (`handleMoveExercise` etc.) don't need this - they read the session
  // fresh via `useActiveWorkoutStore.getState()` at call time instead, per
  // their own comment.
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

  function handleOpenRestTimerSettings() {
    const targetId =
      runningTimerSessionExerciseId ?? activeSession.activeState.focusedSessionExerciseId;
    if (!targetId) {
      return;
    }
    router.push(routes.modals.restTimerSettings(targetId));
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
            extraData={extraData}
            renderItem={renderItem}
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

      <View
        style={{
          paddingHorizontal: space[4],
          paddingBottom: insets.bottom + space[4],
        }}
      >
        <AddExerciseButton
          alreadySelectedIds={alreadySelectedIds}
          onSelect={(exerciseIds) => {
            // Sequential, not `Promise.all`/unawaited `forEach` - concurrent
            // `addExercise` calls race on the same session's `sort_order`
            // write, the exact bug class already found and fixed once in
            // `PlanDayEditorScreen`'s own multi-select add handler (see
            // CLAUDE.md's P9 code-review history).
            void (async () => {
              for (const exerciseId of exerciseIds) {
                await addExercise(activeSession.id, exerciseId);
              }
            })();
          }}
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
