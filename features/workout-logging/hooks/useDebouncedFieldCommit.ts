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
 */
export function useDebouncedFieldCommit<T>(
  currentValue: T,
  commit: (value: T) => void,
  delayMs: number = DEFAULT_DELAY_MS,
): [T, (value: T) => void] {
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

  return [draft, onChange];
}
