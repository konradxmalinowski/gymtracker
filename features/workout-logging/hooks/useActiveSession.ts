import { useEffect, useRef } from 'react';

import { useContainer } from '@/services/container';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';
import { useRestTimerStore } from '@/stores/restTimerStore';

/**
 * ADR-0008 rule 1: "the store is hydrated from SQLite on mount, and only on
 * mount." Call exactly once, from `ActiveWorkoutScreen`'s own top level -
 * never from a component nested inside the exercise list, which can mount
 * and unmount independently of the workout's own lifetime as `FlashList`
 * recycles rows.
 *
 * Deliberately does not branch on whatever `findInProgress()` returns beyond
 * writing it straight into the store: `app/_layout.tsx`'s boot gate is what
 * decided to route here in the first place (a fresh, non-stale session), so
 * by the time this screen mounts a `null` result would mean the session
 * vanished between the gate's read and this one - an edge case handled the
 * same way any other write failure is, by whichever mutation eventually
 * notices `session` is `null` and shows a toast, not by this hook inventing
 * its own error UI.
 *
 * P7: also restores `restTimerStore`'s deadline from
 * `activeState.timerDeadlineAt` when one survived a kill/relaunch - the
 * mechanism `plans/2026-08-08-p7-rest-timer.md`'s "Crash/kill recovery"
 * section calls for. `setDeadline` with a past `deadlineAt` is not a special
 * case: `selectRemainingSeconds`/`selectIsExpired`'s own zero-clamp already
 * renders that as "expired" the instant `RestTimerBar` reads it, matching
 * "shows the timer expired, not still counting" from this phase's
 * acceptance criteria.
 */
export function useActiveSessionHydration(): void {
  const { sessionService, clock } = useContainer();
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) {
      return;
    }
    hasStarted.current = true;

    let cancelled = false;
    void (async () => {
      const snapshot = await sessionService.findInProgress();
      if (cancelled) {
        return;
      }
      useActiveWorkoutStore.getState().setSession(snapshot?.session ?? null);
      useActiveWorkoutStore.getState().markHydrated();

      const { timerDeadlineAt, timerTotalSeconds } = snapshot?.session.activeState ?? {
        timerDeadlineAt: null,
        timerTotalSeconds: null,
      };
      if (timerDeadlineAt !== null) {
        useRestTimerStore
          .getState()
          .setDeadline(timerDeadlineAt, timerTotalSeconds ?? 0, clock.now());
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionService, clock]);
}
