import { useEffect, useRef } from 'react';

import { useContainer } from '@/services/container';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';

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
 */
export function useActiveSessionHydration(): void {
  const { sessionService } = useContainer();
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
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionService]);
}
