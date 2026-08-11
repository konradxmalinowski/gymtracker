import {
  selectIsExpired,
  selectRemainingSeconds,
  useRestTimerStore,
} from '@/stores/restTimerStore';

/**
 * Ephemeral, "recompute never accumulate" countdown store: `deadlineAt` is
 * only ever touched by `setDeadline`/`clearDeadline`, `now` is only ever
 * touched by `tick`/`setDeadline`, and `remainingSeconds`/`isExpired` are
 * pure derivations of the two - never stored fields themselves.
 */
afterEach(() => {
  useRestTimerStore.getState().clearDeadline();
});

describe('restTimerStore - initial state', () => {
  it('starts with no deadline, zero totalSeconds, and now at zero', () => {
    const state = useRestTimerStore.getState();
    expect(state.deadlineAt).toBeNull();
    expect(state.totalSeconds).toBe(0);
    expect(state.now).toBe(0);
  });
});

describe('setDeadline / clearDeadline', () => {
  it('setDeadline stores deadlineAt, totalSeconds, and now exactly as given', () => {
    useRestTimerStore.getState().setDeadline(10_000, 90, 5_000);

    const state = useRestTimerStore.getState();
    expect(state.deadlineAt).toBe(10_000);
    expect(state.totalSeconds).toBe(90);
    expect(state.now).toBe(5_000);
  });

  it('setDeadline replaces an already-running timer rather than merging onto it', () => {
    useRestTimerStore.getState().setDeadline(10_000, 90, 5_000);
    useRestTimerStore.getState().setDeadline(20_000, 60, 15_000);

    const state = useRestTimerStore.getState();
    expect(state).toMatchObject({ deadlineAt: 20_000, totalSeconds: 60, now: 15_000 });
  });

  it('clearDeadline returns the store to its exact initial state', () => {
    useRestTimerStore.getState().setDeadline(10_000, 90, 5_000);

    useRestTimerStore.getState().clearDeadline();

    const state = useRestTimerStore.getState();
    expect(state.deadlineAt).toBeNull();
    expect(state.totalSeconds).toBe(0);
    expect(state.now).toBe(0);
  });

  it('clearDeadline is a safe no-op when no timer is running', () => {
    useRestTimerStore.getState().clearDeadline();

    const state = useRestTimerStore.getState();
    expect(state.deadlineAt).toBeNull();
    expect(state.totalSeconds).toBe(0);
    expect(state.now).toBe(0);
  });
});

describe('tick', () => {
  it('only updates now, leaving deadlineAt and totalSeconds untouched', () => {
    useRestTimerStore.getState().setDeadline(10_000, 90, 1_000);

    useRestTimerStore.getState().tick(7_500);

    const state = useRestTimerStore.getState();
    expect(state.now).toBe(7_500);
    expect(state.deadlineAt).toBe(10_000);
    expect(state.totalSeconds).toBe(90);
  });

  it('calling tick with no deadline set still only updates now (deadlineAt stays null)', () => {
    useRestTimerStore.getState().tick(500);

    const state = useRestTimerStore.getState();
    expect(state.now).toBe(500);
    expect(state.deadlineAt).toBeNull();
  });

  it('never mutates deadlineAt across repeated ticks', () => {
    useRestTimerStore.getState().setDeadline(50_000, 30, 20_000);

    for (const now of [21_000, 30_000, 45_000, 60_000]) {
      useRestTimerStore.getState().tick(now);
      expect(useRestTimerStore.getState().deadlineAt).toBe(50_000);
    }
  });
});

describe('selectRemainingSeconds', () => {
  it('is 0 while no timer is running', () => {
    expect(selectRemainingSeconds(useRestTimerStore.getState())).toBe(0);
  });

  it('derives from deadlineAt - now, ceiling-rounded to the nearest second', () => {
    // 1500ms remaining -> ceil(1.5) = 2s.
    expect(selectRemainingSeconds({ deadlineAt: 10_000, totalSeconds: 90, now: 8_500 })).toBe(2);
    // exactly 2000ms remaining -> 2s.
    expect(selectRemainingSeconds({ deadlineAt: 10_000, totalSeconds: 90, now: 8_000 })).toBe(2);
    // 1ms remaining -> ceils up to 1s, never rounds down to 0 early.
    expect(selectRemainingSeconds({ deadlineAt: 10_000, totalSeconds: 90, now: 9_999 })).toBe(1);
  });

  it('clamps to zero once now reaches or passes the deadline, never goes negative', () => {
    expect(selectRemainingSeconds({ deadlineAt: 10_000, totalSeconds: 90, now: 10_000 })).toBe(0);
    expect(selectRemainingSeconds({ deadlineAt: 10_000, totalSeconds: 90, now: 50_000 })).toBe(0);
  });

  it('reflects a live setDeadline/tick sequence end to end', () => {
    useRestTimerStore.getState().setDeadline(10_000, 10, 0);
    expect(selectRemainingSeconds(useRestTimerStore.getState())).toBe(10);

    useRestTimerStore.getState().tick(4_000);
    expect(selectRemainingSeconds(useRestTimerStore.getState())).toBe(6);

    useRestTimerStore.getState().tick(15_000);
    expect(selectRemainingSeconds(useRestTimerStore.getState())).toBe(0);
  });
});

describe('selectIsExpired', () => {
  it('is false while no timer is running', () => {
    expect(selectIsExpired(useRestTimerStore.getState())).toBe(false);
  });

  it('is false strictly before the deadline', () => {
    expect(selectIsExpired({ deadlineAt: 10_000, totalSeconds: 90, now: 9_999 })).toBe(false);
  });

  it('is true exactly at the deadline', () => {
    expect(selectIsExpired({ deadlineAt: 10_000, totalSeconds: 90, now: 10_000 })).toBe(true);
  });

  it('is true after the deadline', () => {
    expect(selectIsExpired({ deadlineAt: 10_000, totalSeconds: 90, now: 25_000 })).toBe(true);
  });

  it('flips from false to true as tick crosses the deadline, and resets to false on clearDeadline', () => {
    useRestTimerStore.getState().setDeadline(10_000, 10, 0);
    expect(selectIsExpired(useRestTimerStore.getState())).toBe(false);

    useRestTimerStore.getState().tick(10_000);
    expect(selectIsExpired(useRestTimerStore.getState())).toBe(true);

    useRestTimerStore.getState().clearDeadline();
    expect(selectIsExpired(useRestTimerStore.getState())).toBe(false);
  });
});
