import { useEffect, useState } from 'react';

/** Generic, presentation-only debounce - no exercise-library-specific logic, kept alongside its one caller for now rather than promoted to `@/hooks` for a single use site. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}
