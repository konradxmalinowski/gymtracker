import {
  nextSuggestedPlanDay,
  type PlanDayRotationCandidate,
} from '@/features/home/domain/nextSuggestedPlanDay';

function day(id: string, sortOrder: number): PlanDayRotationCandidate {
  return { id, sortOrder };
}

describe('nextSuggestedPlanDay', () => {
  it('returns null for an empty days array', () => {
    expect(nextSuggestedPlanDay([], null)).toBeNull();
  });

  it('returns the first day (by sortOrder) when there is no prior session', () => {
    const days = [day('c', 2), day('a', 0), day('b', 1)];
    expect(nextSuggestedPlanDay(days, null)).toEqual(day('a', 0));
  });

  it('returns the next day after the last-used one', () => {
    const days = [day('a', 0), day('b', 1), day('c', 2)];
    expect(nextSuggestedPlanDay(days, 'a')).toEqual(day('b', 1));
    expect(nextSuggestedPlanDay(days, 'b')).toEqual(day('c', 2));
  });

  it('wraps to the first day when the last-used day was the last in sortOrder', () => {
    const days = [day('a', 0), day('b', 1), day('c', 2)];
    expect(nextSuggestedPlanDay(days, 'c')).toEqual(day('a', 0));
  });

  it('falls back to the first day when the last-used day id is not among the current days (soft-deleted)', () => {
    const days = [day('a', 0), day('b', 1), day('c', 2)];
    expect(nextSuggestedPlanDay(days, 'deleted-day')).toEqual(day('a', 0));
  });

  it('always returns the same single day for a single-day plan, regardless of lastCompletedPlanDayId', () => {
    const days = [day('only', 0)];
    expect(nextSuggestedPlanDay(days, null)).toEqual(day('only', 0));
    expect(nextSuggestedPlanDay(days, 'only')).toEqual(day('only', 0));
    expect(nextSuggestedPlanDay(days, 'some-other-id')).toEqual(day('only', 0));
  });

  it('sorts by sortOrder regardless of input array order', () => {
    const days = [day('c', 2), day('a', 0), day('b', 1)];
    expect(nextSuggestedPlanDay(days, 'a')).toEqual(day('b', 1));
  });
});
