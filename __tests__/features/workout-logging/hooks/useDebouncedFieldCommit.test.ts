import { act, renderHook } from '@testing-library/react-native';

import { useDebouncedFieldCommit } from '@/features/workout-logging/hooks/useDebouncedFieldCommit';

const DELAY_MS = 400;

interface Props {
  currentValue: number;
}

describe('useDebouncedFieldCommit', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('updates the draft immediately but only commits after the delay elapses', async () => {
    const commit = jest.fn();
    const { result } = await renderHook(() => useDebouncedFieldCommit<number>(0, commit, DELAY_MS));

    await act(async () => {
      result.current[1](20);
    });

    expect(result.current[0]).toBe(20);
    expect(commit).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(DELAY_MS);
    });

    expect(commit).toHaveBeenCalledWith(20);
  });

  // The mechanism behind the "weight reverts to 0 after completing a set"
  // bug: `SetRow`'s completion handler sends the row's current draft value
  // through a *different*, more authoritative write of its own
  // (`completeSet`), which synchronously updates the very `currentValue`
  // this hook is fed (`set.weightKg`, via `activeWorkoutStore.patchSet`) in
  // the same tick - exactly what `rerender` below simulates. Without
  // `cancelPending`, this hook's own independently-scheduled `commit` would
  // still go on to fire afterward: a second, redundant write to the same
  // field racing the first, whose response can resolve out of order and
  // stomp it.
  it('cancelPending drops the scheduled commit - it never fires, even once the delay elapses', async () => {
    const commit = jest.fn();
    const { result, rerender } = await renderHook(
      ({ currentValue }: Props) => useDebouncedFieldCommit<number>(currentValue, commit, DELAY_MS),
      { initialProps: { currentValue: 0 } },
    );

    await act(async () => {
      result.current[1](20);
    });
    expect(result.current[0]).toBe(20);

    await act(async () => {
      result.current[2]();
    });
    // Mirrors `SetRow`'s real flow: the caller's own write (`completeSet`)
    // lands the same value into the source of truth this hook reads from.
    await rerender({ currentValue: 20 });

    await act(async () => {
      jest.advanceTimersByTime(DELAY_MS);
    });

    expect(commit).not.toHaveBeenCalled();
    expect(result.current[0]).toBe(20);
  });

  it('cancelPending does not itself touch the draft, and the caller landing the same value as currentValue does not cause a flicker back to the pre-edit value', async () => {
    const commit = jest.fn();
    const { result, rerender } = await renderHook(
      ({ currentValue }: Props) => useDebouncedFieldCommit<number>(currentValue, commit, DELAY_MS),
      { initialProps: { currentValue: 0 } },
    );

    await act(async () => {
      result.current[1](20);
    });
    await act(async () => {
      result.current[2]();
    });
    expect(result.current[0]).toBe(20);

    await rerender({ currentValue: 20 });
    expect(result.current[0]).toBe(20);
  });
});
