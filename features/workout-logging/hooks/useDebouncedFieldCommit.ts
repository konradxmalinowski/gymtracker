import { useEffect, useRef, useState } from 'react';

const DEFAULT_DELAY_MS = 400;

/**
 * Local draft state for a field bound to a value that itself lives in
 * `activeWorkoutStore` (weight/reps/RPE/note on a `SetRow`). `NumberField`/
 * `TextField` fire `onChange` on every keystroke, and ADR-0005 mechanism 1's
 * "editing a value ... commits its own transaction" does not mean "one
 * transaction per keystroke" - `PlanDayEditorScreen`'s edit sheet gets away
 * with committing only on an explicit Save press because it has one; a set
 * row has no per-field save button (that would blow the NFR-01 tap budget),
 * so this hook is the debounce that stands in for one: every keystroke
 * updates the visible draft immediately, but `commit` (the store write +
 * service dispatch) only fires once the user pauses for `delayMs`.
 *
 * `currentValue` re-syncs the draft when it changes for a reason other than
 * this hook's own debounce - e.g. `activeWorkoutStore` reconciling from the
 * database after an unrelated write failure elsewhere on the row. Tracked
 * with `hasPendingEdit` **state**, not a ref read during render - this
 * project's React Compiler lint rule (`react-hooks/refs`) forbids reading
 * `.current` inside the render body, the same reason `NumberField.tsx`
 * itself tracks its own "did the prop change externally" via
 * `useState(value)` rather than a ref.
 *
 * The third return value, `cancelPending`, exists for a caller that is about
 * to send the current `draft` value through a *different*, more
 * authoritative write of its own - `SetRow`'s completion handler is the one
 * caller today, threading `weightDraft`/`repsDraft`/`rpeDraft`/`noteDraft`
 * straight into `completeSet`'s own `CompleteSetValues` rather than waiting
 * on each field's independent debounce. Without cancelling, a still-pending
 * timer here would go on to fire its own separate `commit` after completion
 * has already landed - a second, independent write to the same set racing
 * the first, whose full-object-replace response can resolve out of order
 * and stomp a field the first write already got right. This was the actual
 * mechanism behind the "weight reverts to 0 after completing" bug fixed
 * alongside this comment: completing a set called `onComplete(set)` with no
 * values, so the set's weight/reps were only ever backed by their own
 * independent debounced `updateSet` calls - concurrent with, and racing
 * against, `completeSet`'s own write. `cancelPending` only clears the timer
 * and drops `hasPendingEdit` - it deliberately leaves `lastSyncedValue`
 * alone rather than snapping it to `draft`. Setting it to `draft` was tried
 * first and is wrong: `lastSyncedValue` means "the last value we actually
 * observed `currentValue` hold," and `draft` was never observed there - it
 * was only ever a local, not-yet-committed guess. Forcing them equal creates
 * a false mismatch against the *actual*, still-unchanged `currentValue` on
 * the very next render, which the reconciliation check above reads as "the
 * prop changed externally," snapping `draft` straight back down to the
 * stale value it was supposed to escape (caught by this hook's own test
 * suite before it ever reached `SetRow`). Leaving `lastSyncedValue`
 * untouched keeps that invariant intact: the reconciliation stays quiet
 * until `currentValue` genuinely changes - which the caller's own write
 * (success or `recoverFromWriteFailure`'s reconciliation) will do shortly
 * after - and at that point correctly adopts whatever `currentValue` turns
 * out to be, matching `draft` on the happy path and correcting it on the
 * unhappy one.
 */
export function useDebouncedFieldCommit<T>(
  currentValue: T,
  commit: (value: T) => void,
  delayMs: number = DEFAULT_DELAY_MS,
): [T, (value: T) => void, () => void] {
  const [draft, setDraft] = useState(currentValue);
  const [lastSyncedValue, setLastSyncedValue] = useState(currentValue);
  const [hasPendingEdit, setHasPendingEdit] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!hasPendingEdit && currentValue !== lastSyncedValue) {
    setLastSyncedValue(currentValue);
    setDraft(currentValue);
  }

  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    [],
  );

  function onChange(value: T) {
    setDraft(value);
    setHasPendingEdit(true);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setHasPendingEdit(false);
      setLastSyncedValue(value);
      commit(value);
    }, delayMs);
  }

  function cancelPending() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setHasPendingEdit(false);
  }

  return [draft, onChange, cancelPending];
}
