import { useEffect } from 'react';

import { useAppState } from '@/hooks/useAppState';
import { haptics } from '@/services/haptics';
import type { Clock } from '@/services/clock';
import { kv } from '@/services/kv';
import { selectIsExpired, useRestTimerStore } from '@/stores/restTimerStore';

/** `restTimerStore.ts`'s own doc comment: "a caller that ticks every 250ms while mounted, plus once more on every `AppState` 'active' transition, gets a countdown that is always correct to the second." This hook is that caller. */
const TICK_INTERVAL_MS = 250;

/**
 * Drives `restTimerStore.tick()` - the interval half plus the
 * `AppState` "active" half R-04 requires (`docs/ARCHITECTURE.md` line
 * ~1879: recompute remaining time from wall clock on every foreground,
 * never trust a backgrounded JS interval's own elapsed count) - and fires
 * `haptics.timerFinished()` exactly once on the not-expired -> expired
 * transition (code review finding: `timer.vibration` was a dead setting -
 * read/written by the settings screen but never consulted anywhere the
 * timer actually expires, and `haptics.timerFinished()` had zero callers).
 *
 * The transition is detected via `useRestTimerStore.subscribe()` (a plain
 * Zustand subscription, not a selector hook) rather than by reading
 * `selectIsExpired` during render, specifically so this doesn't force
 * `ActiveWorkoutScreen`/`ActiveWorkoutBanner` to re-render on every 250ms
 * tick just to notice an expiry - the subscription callback runs outside
 * React's render cycle and only ever *acts* on the one tick where
 * `isExpired` actually flips. `timer.vibration` is read from the MMKV
 * mirror (`services/kv`) rather than an async settings query for the same
 * reason `services/haptics/settings.ts`'s `isHapticsEnabled()` reads its
 * own mirror instead of `container.settings` - this callback cannot await
 * anything. `haptics.timerFinished()` already gates on the *global*
 * `haptics.enabled` toggle internally; `timer.vibration` is an additional,
 * feature-specific gate layered on top, checked here.
 *
 * Only one subscription's closure "wins" the haptic per real expiry event:
 * `ActiveWorkoutScreen` and `ActiveWorkoutBanner` each mount their own
 * instance of this hook, but the two are never mounted at the same time
 * (`workout/active` is a root-level route outside `(tabs)` per ADR-0007), so
 * exactly one subscription observes any given transition.
 *
 * Takes `clock` as a parameter rather than reading it from
 * `useContainer()` itself: `services/container.ts` transitively imports
 * `workout-logging` (for `WorkoutSessionService`), which imports this
 * feature's own barrel (for `resolveRestSeconds`) - a `rest-timer` module
 * reaching back into `useContainer()` would close that into a real
 * `import/no-cycle` violation (the same class of cycle
 * `app/(modals)/exercise-picker.tsx`'s file header already documents
 * hitting once elsewhere in this codebase). `@/services/clock` itself
 * imports nothing feature-shaped, so accepting its `Clock` type as a plain
 * parameter keeps this feature a leaf per ARCHITECTURE.md section 9.1 while
 * every real caller (both in `workout-logging`) just passes
 * `container.clock` straight through. `services/haptics`/`services/kv` are
 * root services with no feature imports of their own, so importing them
 * directly here carries no such cycle risk.
 *
 * Call once per screen that needs a live countdown - `ActiveWorkoutScreen`
 * and `ActiveWorkoutBanner` each mount their own (never both at once, since
 * `workout/active` is a root-level route outside `(tabs)` per ADR-0007, so
 * only one of the two is ever on screen).
 */
export function useRestTimerTick(clock: Clock): void {
  const appState = useAppState();

  useEffect(() => {
    const interval = setInterval(() => {
      useRestTimerStore.getState().tick(clock.now());
    }, TICK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [clock]);

  useEffect(() => {
    if (appState === 'active') {
      useRestTimerStore.getState().tick(clock.now());
    }
  }, [appState, clock]);

  useEffect(() => {
    const unsubscribe = useRestTimerStore.subscribe((state, prevState) => {
      const isExpiredNow = selectIsExpired(state);
      const wasExpiredBefore = selectIsExpired(prevState);
      if (isExpiredNow && !wasExpiredBefore && (kv.get('timer.vibration') ?? true)) {
        void haptics.timerFinished();
      }
    });
    return unsubscribe;
  }, []);
}
