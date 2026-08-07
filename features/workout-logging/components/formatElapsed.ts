/**
 * Display-only elapsed-time formatting shared by `WorkoutHeader` and
 * `ActiveWorkoutBanner` - both tick from `startedAt` client-side (a plain
 * `setInterval`, not the persisted-deadline mechanism ADR-0005 mandates for
 * the rest timer; this is cosmetic display, not a crash-safety-critical
 * value). `pausedMs` is subtracted for forward compatibility with a future
 * pause feature - P6 never writes a non-zero value, so it is always `0`
 * today.
 */
export function formatElapsedSeconds(startedAt: number, pausedMs: number, now: number): string {
  const elapsedMs = Math.max(0, now - startedAt - pausedMs);
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (value: number) => String(value).padStart(2, '0');

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
