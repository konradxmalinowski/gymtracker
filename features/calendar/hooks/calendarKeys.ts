/**
 * Query-key family for this feature (ARCHITECTURE.md section 12.1's
 * already-reserved `['calendar', year, month]` shape), shared by
 * `useCalendarMonth`/`useCalendarYear` - split into its own file so neither
 * hook has to import the other's key builder, and so
 * `invalidateAfterWorkoutFinish`'s existing `['calendar']` invalidation
 * (`features/workout-logging/hooks/invalidation.ts`, wired since P9 in
 * anticipation of this feature) matches both key families for free: both
 * start with the literal `'calendar'` segment, so a bare
 * `invalidateQueries({ queryKey: ['calendar'] })` matches every month and
 * every year query TanStack Query has cached, per its own prefix-matching
 * default.
 */
export const calendarKeys = {
  month: (year: number, month: number) => ['calendar', year, month] as const,
  year: (year: number) => ['calendar', 'year', year] as const,
};
