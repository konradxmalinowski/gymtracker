import { formatElapsedSeconds } from './formatElapsed';

/**
 * Display-only duration formatting for an already-known `durationSeconds`
 * total (`SessionSummary.durationSeconds`/`SessionListItem.durationSeconds`/
 * `SessionAggregate.durationSeconds`) - a sibling of `formatElapsed.ts`'s
 * `formatElapsedSeconds`, which instead ticks live from `startedAt`/`now`
 * for the still-in-progress workout header/banner. P9's summary and history
 * screens only ever have a finished session's final total, never a live
 * clock to tick, so this delegates to `formatElapsedSeconds` with a
 * synthetic `startedAt=0`/`pausedMs=0`/`now=totalSeconds * 1000` rather than
 * reimplementing the same hours/minutes/seconds padding and threshold logic
 * a second time - `formatElapsedSeconds`'s own `Math.max(0, ...)` clamp
 * covers a negative `totalSeconds` the same way this function's own
 * `Math.max` used to.
 */
export function formatSessionDurationSeconds(totalSeconds: number): string {
  return formatElapsedSeconds(0, 0, totalSeconds * 1000);
}
