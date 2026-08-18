import type { PlanDay } from '@/features/plans';

/**
 * The two fields `nextSuggestedPlanDay` actually needs, `Pick`ed from the
 * real `PlanDay` type (`features/plans`, imported through its barrel per
 * ARCHITECTURE.md section 3.1 rule 4) rather than a parallel `{ id,
 * sortOrder }` interface - a caller holding full `PlanDay` rows (in any
 * order) can pass them straight through with no adapter, and the generic
 * `T` below hands the exact same object back so the caller keeps every
 * other field it already had.
 */
export type PlanDayRotationCandidate = Pick<PlanDay, 'id' | 'sortOrder'>;

/**
 * P10 decision 2 (simple rotation, no streak/rest-day awareness): the day
 * after whichever day the most recently completed session for the active
 * plan used, cycling by `sortOrder`, wrapping to the first day after the
 * last. Falls back to the first day (by `sortOrder`) when there is no prior
 * session (`lastCompletedPlanDayId === null`) or when that prior session's
 * day is no longer among `days` (soft-deleted since). `null` only when
 * `days` itself is empty.
 */
export function nextSuggestedPlanDay<T extends PlanDayRotationCandidate>(
  days: readonly T[],
  lastCompletedPlanDayId: string | null,
): T | null {
  if (days.length === 0) {
    return null;
  }

  const ordered = [...days].sort((a, b) => a.sortOrder - b.sortOrder);
  // Every index below is derived from `ordered`'s own (non-empty, checked
  // above) length, so each lookup is in-bounds - the non-null assertions
  // just satisfy noUncheckedIndexedAccess.
  const first = ordered[0]!;

  if (lastCompletedPlanDayId === null) {
    return first;
  }

  const lastIndex = ordered.findIndex((day) => day.id === lastCompletedPlanDayId);
  if (lastIndex === -1) {
    return first;
  }

  return ordered[(lastIndex + 1) % ordered.length]!;
}
