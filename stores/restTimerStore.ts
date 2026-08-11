import { create } from 'zustand';

/**
 * Ephemeral UI state only (CLAUDE.md's Zustand scope) - this is NOT a second
 * exception to ADR-0008 alongside `activeWorkoutStore`. It mirrors nothing
 * persisted and owns nothing: `deadlineAt` is always fed in from outside
 * (read off `active_session_state.timer_deadline_at` by whatever calls
 * `setDeadline`, per `features/workout-logging`'s ownership of that column)
 * and this store never writes it back anywhere. If the app is killed and
 * relaunched, this store starts empty again - the deadline is re-read from
 * SQLite by the caller, not recovered from here.
 *
 * R-04 (`docs/ARCHITECTURE.md` line ~1879): a rest timer must stay accurate
 * across backgrounding and Android Doze, which rules out a `setInterval`
 * decrement (drifts, and stops firing in the background) as the source of
 * truth. The fix this store implements is "recompute, never accumulate":
 * `remainingSeconds` is derived fresh every time from `deadlineAt - now`,
 * where `now` is a wall-clock reading the caller pushes in via `tick()` - it
 * is never incremented/decremented in place. A caller that ticks every 250 ms
 * while mounted, plus once more on every `AppState` "active" transition, gets
 * a countdown that is always correct to the second regardless of how long the
 * app was backgrounded, without this store doing anything more clever than
 * a subtraction.
 *
 * This store deliberately owns no timer/interval/`AppState` listener itself -
 * it is a passive value container. Driving `tick()` (and reading `now` from
 * `container.clock.now()` per this project's Clock-seam convention, never a
 * direct `Date.now()`) is the consuming component/hook's job - `RestTimerBar`
 * and its ticking hook, both out of this pass's scope.
 *
 * Consume only via selectors (`useRestTimerStore(selectRemainingSeconds)`),
 * never the whole store with no selector, same rule as `activeWorkoutStore`.
 */
export interface RestTimerStoreState {
  /** Absolute epoch ms the timer counts down to, or `null` when no timer is running. Never owned/persisted here - always set by the caller from `active_session_state.timer_deadline_at`. */
  deadlineAt: number | null;
  /** The full duration this deadline was started for, in seconds - carried alongside `deadlineAt` for `RestTimerBarProps.totalSeconds` (progress-ring fraction, "reset to full" on adjust). Meaningless while `deadlineAt` is `null`. */
  totalSeconds: number;
  /** Last wall-clock reading pushed in via `tick()`/`setDeadline()`. The sole input `remainingSeconds`/`isExpired` are derived from - never read directly by a consumer. */
  now: number;
}

interface RestTimerStoreActions {
  /** Starts (or replaces) a running timer. `now` is required alongside `deadlineAt`/`totalSeconds` so the first read of `remainingSeconds` is correct immediately, without waiting for the next `tick()`. */
  setDeadline: (deadlineAt: number, totalSeconds: number, now: number) => void;
  /** Stops the timer - the "skip"/"early finish" case. Returns the store to its initial, no-timer state. */
  clearDeadline: () => void;
  /** Pushes a fresh wall-clock reading so `remainingSeconds`/`isExpired` recompute. A no-op on `remainingSeconds`'s value if called with the same `now` twice; safe to call as often as the caller likes. */
  tick: (now: number) => void;
}

export type RestTimerStore = RestTimerStoreState & RestTimerStoreActions;

const initialState: RestTimerStoreState = {
  deadlineAt: null,
  totalSeconds: 0,
  now: 0,
};

export const useRestTimerStore = create<RestTimerStore>((set) => ({
  ...initialState,
  setDeadline: (deadlineAt, totalSeconds, now) => set({ deadlineAt, totalSeconds, now }),
  clearDeadline: () => set({ ...initialState }),
  tick: (now) => set({ now }),
}));

/** Seconds remaining, clamped to zero - never negative, even if `now` runs past `deadlineAt` before the next `clearDeadline()`. `0` (not the last real duration) while no timer is running. */
export function selectRemainingSeconds(state: RestTimerStoreState): number {
  if (state.deadlineAt === null) {
    return 0;
  }
  const remainingMs = state.deadlineAt - state.now;
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

/** `true` once `now` has reached or passed `deadlineAt`. `false` while no timer is running - "expired" only makes sense for a timer that was started. */
export function selectIsExpired(state: RestTimerStoreState): boolean {
  if (state.deadlineAt === null) {
    return false;
  }
  return state.now >= state.deadlineAt;
}
