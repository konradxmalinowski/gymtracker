import { useEffect, useRef } from 'react';

/**
 * Dev-only render-count instrumentation (`docs/ROADMAP.md`'s P15 acceptance
 * line: "render-count instrumentation on the workout screen"). A diagnostic
 * tool, not a test: it lets a developer confirm live, on a real device, that
 * the `ActiveWorkoutScreen` `renderItem`/`extraData` hoist and the
 * `SessionExerciseCard`/`SetRow` `React.memo` wrap (CLAUDE.md's own tracked
 * "Known gap" about `extraData` not actually being load-bearing) are doing
 * their job - e.g. that completing one set in exercise 5 does not also
 * re-render exercise 1's card. Cross-cutting rather than feature-owned, the
 * same "first real occupant of a folder this file's own header lists as
 * reserved" precedent `hooks/useAppState.ts` set for this same root `hooks/`
 * folder in P7.
 *
 * The count/log lives inside a no-dependency-array `useEffect` (runs after
 * every render, mount included), not directly in the render body: mutating
 * or reading a ref's `.current` during render itself is a real bug class
 * (this project's `react-hooks/refs` lint rule catches exactly that -
 * confirmed by first writing this hook with the increment in the render
 * body and watching that rule fire), since it can read a stale or
 * about-to-be-discarded value under concurrent rendering. An effect runs
 * after commit, which is the correct place for this kind of side effect.
 *
 * A true no-op outside `__DEV__`, not just visually hidden: `__DEV__` is a
 * compile-time global Metro/React Native replaces with a literal `false` in
 * a release bundle, so the `if (!__DEV__) return` branch below - and the
 * counter increment plus `console.log` call it guards - is dead code a
 * minified production bundle eliminates entirely (the same guarantee
 * `app/dev/db-health.tsx`/`app/dev/gallery.tsx`'s own `__DEV__`-guarded
 * `Redirect` relies on). `useRef`/`useEffect` themselves are still called
 * unconditionally - a hook may never be called conditionally, even one that
 * then immediately no-ops - so the only thing production actually pays for
 * is one extra effect registration per render whose callback returns
 * immediately.
 *
 * Deliberately a plain `console.log`, not `services/logging`'s `Logger`:
 * that service's 500-entry ring buffer and rolling log file exist for
 * production crash/diagnostic history (ADR-0014), and a per-render dev
 * counter firing many times a second while a workout is being edited is
 * exactly the kind of high-frequency noise that buffer should never hold.
 */
export function useRenderCount(label: string): void {
  const countRef = useRef(0);
  useEffect(() => {
    if (!__DEV__) {
      return;
    }
    countRef.current += 1;
    console.log(`[render-count] ${label}: ${countRef.current}`);
  });
}
