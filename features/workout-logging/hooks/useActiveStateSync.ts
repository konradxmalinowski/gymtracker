import { useCallback, useEffect, useRef } from 'react';

import { useContainer } from '@/services/container';

const DEBOUNCE_MS = 500;

/**
 * Writes `active_session_state.focused_session_exercise_id` /
 * `.scroll_offset` (ARCHITECTURE.md section 10.3's screen holds both so a
 * relaunch can restore where the user was, not just what they'd logged).
 * Debounced and fire-and-forget - this is convenience state, not anything
 * FR-19's recovery guarantee depends on (the sets themselves are already
 * durable per ADR-0005), so it is never awaited by a caller and a failed
 * write here does not reconcile the store or show a toast.
 */
export function useActiveStateSync(sessionId: string | undefined) {
  const { sessionService } = useContainer();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    [],
  );

  const syncFocusedExercise = useCallback(
    (focusedSessionExerciseId: string | null) => {
      if (!sessionId) {
        return;
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        void sessionService
          .saveActiveState({ sessionId, focusedSessionExerciseId })
          .catch(() => {});
      }, DEBOUNCE_MS);
    },
    [sessionService, sessionId],
  );

  const syncScrollOffset = useCallback(
    (scrollOffset: number) => {
      if (!sessionId) {
        return;
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        void sessionService.saveActiveState({ sessionId, scrollOffset }).catch(() => {});
      }, DEBOUNCE_MS);
    },
    [sessionService, sessionId],
  );

  return { syncFocusedExercise, syncScrollOffset };
}
