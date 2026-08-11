/**
 * Display-only `m:ss` formatting for the rest countdown - mirrors
 * `features/workout-logging/components/formatElapsed.ts`'s shape (own file,
 * pure function, no hours segment needed here since `timer.defaultRestSeconds`
 * tops out at 1800s/30min per the settings schema, well under an hour).
 */
export function formatRestSeconds(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
