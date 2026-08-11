import { useCallback } from 'react';

import { restTimerNotificationService, shouldStartRestTimer } from '@/features/rest-timer';
import { REST_SECONDS_MAX, REST_SECONDS_MIN } from '@/repositories/settings';
import { useContainer, type AppContainer } from '@/services/container';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';
import { useRestTimerStore } from '@/stores/restTimerStore';

type RestTimerDeps = Pick<AppContainer, 'sessionService' | 'settings' | 'clock'>;

/**
 * P7 workout-logging <-> rest-timer integration glue
 * (`plans/2026-08-08-p7-rest-timer.md`, pass 3). Lives here rather than in
 * `features/rest-timer` because it imports `activeWorkoutStore`/
 * `WorkoutSessionService` internals - putting it in `rest-timer` would
 * invert ARCHITECTURE.md section 9.1's dependency edge ("`rest-timer` must
 * not depend on `workout-logging` - `workout-logging` depends on it").
 * `features/rest-timer/components/RestTimerBar.tsx` and
 * `RestTimerSettingsSheet.tsx` stay prop-driven precisely so they never need
 * to import from here.
 */

/**
 * Monotonic ordering guard (code review finding, P7 pass 3 follow-up):
 * `saveActiveState` is a plain last-write-wins UPSERT with no ordering
 * guard of its own, and the four write paths below each dispatch it from
 * independent async chains of differing length (a first-ever notification
 * permission prompt, a settings read, a notification cancel+reschedule
 * round trip). Without this guard, an operation that *started* earlier but
 * *resolves* later (e.g. timer A's chain includes a permission dialog;
 * timer B, started afterward by an immediate adjust, has no such delay and
 * resolves first) can still persist its now-stale deadline/notification id
 * over a newer one already on screen - and a crash right after restores
 * exactly that stale, already-cancelled timer.
 *
 * Every entry point below calls {@link bumpTimerOperationSequence}
 * synchronously, before any `await`, and captures the returned number.
 * Anything that is not itself gated by an ordering check (the initial
 * `restTimerStore.setDeadline`/`clearDeadline` call in each path) is safe to
 * apply immediately with no guard, because - having no `await` before it -
 * it is already correctly ordered by real call time: whichever operation
 * the user triggered *later* also reaches its own synchronous `setDeadline`
 * call later, so the store can never be clobbered out of order. Only the
 * writes that necessarily wait on async work (persisting the resolved
 * notification id to `active_session_state`, and the notification schedule
 * call itself) are gated by {@link isStaleTimerOperation}: if a newer
 * operation has since bumped the sequence past this one's captured value,
 * this one's just-scheduled notification is cancelled (it would otherwise
 * fire for a deadline nobody is showing anymore) and the DB write is
 * skipped entirely, leaving whatever the newer operation already wrote
 * untouched.
 *
 * `useFinishDiscardWorkout.clearAndExit` also bumps this sequence (via the
 * same exported function) so that a rest-timer operation still in flight
 * when the user finishes or discards the workout recognizes itself as
 * stale too, rather than resurrecting `active_session_state` timer columns
 * for a session `finish()`/`discard()` already dropped that row for.
 *
 * Deliberately never reset (not part of any Zustand store's `clear()`
 * payload, even though `clearAndExit` bumps it): resetting to 0 on a new
 * workout would let a still-in-flight operation from the *previous*,
 * already-finished workout collide with a same-numbered operation in the
 * new one and be incorrectly treated as current. A plain, ever-increasing
 * module-level counter has no such collision - this module is a singleton
 * for the app's lifetime, the same way `services/kv`'s `MmkvStore`
 * singleton is.
 */
let timerOperationSequence = 0;

export function bumpTimerOperationSequence(): number {
  timerOperationSequence += 1;
  return timerOperationSequence;
}

function isStaleTimerOperation(mySequence: number): boolean {
  return mySequence !== timerOperationSequence;
}

/** Shared core for both the delta nudge and the absolute preset pick: persists the override, and - only if the exercise being adjusted is the one currently driving the live countdown - re-times the running deadline and reschedules its notification. */
async function persistOverrideAndMaybeRetime(
  sessionExerciseId: string,
  newSeconds: number,
  deps: RestTimerDeps,
): Promise<void> {
  const mySequence = bumpTimerOperationSequence();

  try {
    await deps.sessionService.setExerciseRestOverride(sessionExerciseId, newSeconds);
    useActiveWorkoutStore.getState().patchExercise(sessionExerciseId, {
      restSecondsOverride: newSeconds,
    });
  } catch {
    // Best-effort, same posture as every other mutation hook in this
    // feature that doesn't await its repository write from the caller.
    return;
  }

  const session = useActiveWorkoutStore.getState().session;
  const runningId = useActiveWorkoutStore.getState().runningTimerSessionExerciseId;
  const restState = useRestTimerStore.getState();
  const isLiveTimerForThisExercise =
    session !== null && restState.deadlineAt !== null && runningId === sessionExerciseId;

  if (!isLiveTimerForThisExercise || session === null || restState.deadlineAt === null) {
    return;
  }

  // Re-anchors to the same start instant the running countdown already had,
  // just with a different total - the edge case this produces on purpose:
  // adjusting to a value at or below elapsed time yields a deadline in the
  // past, which `selectRemainingSeconds`'s existing zero-clamp then renders
  // as "expired" rather than negative, with no special-casing needed here.
  const startAt = restState.deadlineAt - restState.totalSeconds * 1000;
  const now = deps.clock.now();
  const newDeadlineAt = startAt + newSeconds * 1000;

  // No `await` between here and the ordering-guard note above: this call is
  // already correctly ordered by real call time, see this module's header.
  useRestTimerStore.getState().setDeadline(newDeadlineAt, newSeconds, now);

  const oldNotificationId = session.activeState.timerNotificationId;
  if (oldNotificationId) {
    void restTimerNotificationService.cancelScheduledNotification(oldNotificationId);
  }
  const notificationsEnabled = await deps.settings.get('timer.notification');
  const notificationId = await restTimerNotificationService.scheduleRestNotification(
    newDeadlineAt,
    newSeconds,
    notificationsEnabled,
  );

  if (isStaleTimerOperation(mySequence)) {
    if (notificationId) {
      void restTimerNotificationService.cancelScheduledNotification(notificationId);
    }
    return;
  }

  useActiveWorkoutStore.getState().patchActiveState({
    timerDeadlineAt: newDeadlineAt,
    timerTotalSeconds: newSeconds,
    timerNotificationId: notificationId,
  });

  void deps.sessionService
    .saveActiveState({
      sessionId: session.id,
      timerDeadlineAt: newDeadlineAt,
      timerTotalSeconds: newSeconds,
      timerNotificationId: notificationId,
    })
    .catch(() => {});
}

/**
 * Called from `useCompleteSet` (`useSetMutations.ts`) after a set completes.
 * Fire-and-forget, matching NFR-01's hot path: the caller does not await
 * this, the same way it does not await `sessionService.completeSet` either.
 *
 * Applies, in order: the superset skip rule (`shouldStartRestTimer`, Pass 1,
 * already tested - this is just the call site), the `timer.autoStart`
 * setting (a user who has turned auto-start off gets no timer at all, not a
 * timer they have to manually cancel), the already-seeded
 * `session_exercise.rest_seconds_override` (Pass 2 guarantees a concrete
 * value by add/start time; the settings fallback here is defensive, not the
 * primary path), and `timer.notification` (passed straight to the
 * notification service as a plain boolean per its own contract).
 *
 * `setDeadline`/`setRunningTimerSessionExerciseId` fire as soon as the
 * deadline is computed, *before* awaiting `scheduleRestNotification` (code
 * review finding, P7 pass 3 follow-up: on a user's first-ever completed set
 * with notifications enabled, `scheduleRestNotification` internally awaits
 * the native OS permission dialog - the visible countdown must not wait on
 * that too, even though the deadline was already fixed). This matches the
 * ordering `persistOverrideAndMaybeRetime` above already used correctly.
 */
export function useMaybeStartRestTimer() {
  const container = useContainer();
  const { sessionService, settings, clock } = container;
  return useCallback(
    (sessionExerciseId: string) => {
      void (async () => {
        const mySequence = bumpTimerOperationSequence();

        const session = useActiveWorkoutStore.getState().session;
        if (!session) {
          return;
        }
        const exercise = session.exercises.find((candidate) => candidate.id === sessionExerciseId);
        if (!exercise) {
          return;
        }

        const shouldStart = shouldStartRestTimer({
          completedSessionExerciseId: sessionExerciseId,
          sessionExercises: session.exercises.map((candidate) => ({
            sessionExerciseId: candidate.id,
            supersetGroup: candidate.supersetGroup,
            sortOrder: candidate.sortOrder,
            // `session.exercises` only ever holds non-deleted rows (the
            // repository's own `WHERE deleted_at IS NULL`), so every entry
            // here genuinely is non-deleted - never a stand-in default.
            isDeleted: false,
          })),
        });
        if (!shouldStart) {
          return;
        }

        const autoStart = await settings.get('timer.autoStart');
        if (!autoStart) {
          return;
        }

        const totalSeconds =
          exercise.restSecondsOverride ?? (await settings.get('timer.defaultRestSeconds'));
        const now = clock.now();
        const deadlineAt = now + totalSeconds * 1000;

        // No `await` between here and the ordering-guard note at the top of
        // this module: this pair of calls is already correctly ordered by
        // real call time.
        useRestTimerStore.getState().setDeadline(deadlineAt, totalSeconds, now);
        useActiveWorkoutStore.getState().setRunningTimerSessionExerciseId(sessionExerciseId);

        const notificationsEnabled = await settings.get('timer.notification');
        const notificationId = await restTimerNotificationService.scheduleRestNotification(
          deadlineAt,
          totalSeconds,
          notificationsEnabled,
        );

        if (isStaleTimerOperation(mySequence)) {
          if (notificationId) {
            void restTimerNotificationService.cancelScheduledNotification(notificationId);
          }
          return;
        }

        useActiveWorkoutStore.getState().patchActiveState({
          timerDeadlineAt: deadlineAt,
          timerTotalSeconds: totalSeconds,
          timerNotificationId: notificationId,
        });

        void sessionService
          .saveActiveState({
            sessionId: session.id,
            timerDeadlineAt: deadlineAt,
            timerTotalSeconds: totalSeconds,
            timerNotificationId: notificationId,
          })
          .catch(() => {});
      })();
    },
    [sessionService, settings, clock],
  );
}

/** `RestTimerBar`'s swipe-to-dismiss (`onSkip`) - cancels the scheduled notification, clears the live countdown, and clears the persisted deadline. Error-handling strategy's "early finish ... cancels the scheduled notification" applies here too, not just to finishing the exercise/set. Entirely synchronous up to the point it applies its result, so it needs no staleness check of its own - it only needs to bump the sequence so any operation still in flight from *before* this skip recognizes itself as stale when it eventually resolves. */
export function useSkipRestTimer() {
  const { sessionService } = useContainer();
  return useCallback(() => {
    bumpTimerOperationSequence();

    const session = useActiveWorkoutStore.getState().session;
    const notificationId = session?.activeState.timerNotificationId ?? null;
    if (notificationId) {
      void restTimerNotificationService.cancelScheduledNotification(notificationId);
    }

    useRestTimerStore.getState().clearDeadline();
    useActiveWorkoutStore.getState().setRunningTimerSessionExerciseId(null);
    useActiveWorkoutStore.getState().patchActiveState({
      timerDeadlineAt: null,
      timerTotalSeconds: null,
      timerNotificationId: null,
    });

    if (session) {
      void sessionService
        .saveActiveState({
          sessionId: session.id,
          timerDeadlineAt: null,
          timerTotalSeconds: null,
          timerNotificationId: null,
        })
        .catch(() => {});
    }
  }, [sessionService]);
}

/**
 * `RestTimerBar`'s -/+ delta buttons (`onAdjust`). Targets whichever
 * exercise is driving the live countdown (`runningTimerSessionExerciseId`),
 * falling back to `activeState.focusedSessionExerciseId` (a real, persisted
 * column) after a kill/relaunch, when the ephemeral field above is gone -
 * see `activeWorkoutStore.ts`'s doc comment on that field for the full
 * reasoning. A no-op if neither resolves to a real exercise (nothing to
 * adjust).
 */
export function useAdjustRestTimerDelta() {
  const container = useContainer();
  return useCallback(
    (deltaSeconds: number) => {
      const session = useActiveWorkoutStore.getState().session;
      if (!session) {
        return;
      }
      const targetId =
        useActiveWorkoutStore.getState().runningTimerSessionExerciseId ??
        session.activeState.focusedSessionExerciseId;
      if (!targetId) {
        return;
      }
      const exercise = session.exercises.find((candidate) => candidate.id === targetId);
      const restState = useRestTimerStore.getState();
      const currentSeconds =
        restState.deadlineAt !== null
          ? restState.totalSeconds
          : (exercise?.restSecondsOverride ?? 0);
      const newSeconds = Math.min(
        REST_SECONDS_MAX,
        Math.max(REST_SECONDS_MIN, currentSeconds + deltaSeconds),
      );
      void persistOverrideAndMaybeRetime(targetId, newSeconds, container);
    },
    [container],
  );
}

/** `RestTimerSettingsSheet`'s preset chip tap, via `app/(modals)/rest-timer-settings.tsx` - an absolute value for a known exercise (the route's own `sessionExerciseId` param), rather than a delta off whatever's currently running. */
export function useSetRestTimerPreset() {
  const container = useContainer();
  return useCallback(
    (sessionExerciseId: string, seconds: number) => {
      void persistOverrideAndMaybeRetime(sessionExerciseId, seconds, container);
    },
    [container],
  );
}
