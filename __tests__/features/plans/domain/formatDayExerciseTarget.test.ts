import { formatDayExerciseTarget } from '@/features/plans/domain/formatDayExerciseTarget';

const EMPTY = {
  targetSets: null,
  targetRepMin: null,
  targetRepMax: null,
  targetRpe: null,
  restSeconds: null,
};

describe('formatDayExerciseTarget', () => {
  it('returns null when every field is null', () => {
    expect(formatDayExerciseTarget(EMPTY)).toBeNull();
  });

  it('formats sets and a rep range', () => {
    expect(
      formatDayExerciseTarget({ ...EMPTY, targetSets: 3, targetRepMin: 8, targetRepMax: 12 }),
    ).toBe('3 x 8-12');
  });

  it('collapses a rep range to a single number when min equals max', () => {
    expect(
      formatDayExerciseTarget({ ...EMPTY, targetSets: 4, targetRepMin: 10, targetRepMax: 10 }),
    ).toBe('4 x 10');
  });

  it('falls back to "N sets" when there is no rep range at all', () => {
    expect(formatDayExerciseTarget({ ...EMPTY, targetSets: 5 })).toBe('5 sets');
  });

  it('renders a bare rep range with no set count', () => {
    expect(formatDayExerciseTarget({ ...EMPTY, targetRepMin: 8, targetRepMax: 12 })).toBe('8-12');
  });

  it('appends RPE after the sets/reps summary', () => {
    expect(
      formatDayExerciseTarget({
        ...EMPTY,
        targetSets: 3,
        targetRepMin: 8,
        targetRepMax: 12,
        targetRpe: 8,
      }),
    ).toBe('3 x 8-12 @ RPE 8');
  });

  it('appends a rest override after the rest of the summary', () => {
    expect(
      formatDayExerciseTarget({
        ...EMPTY,
        targetSets: 3,
        targetRepMin: 8,
        targetRepMax: 12,
        restSeconds: 90,
      }),
    ).toBe('3 x 8-12 - rest 90s');
  });

  it('renders a rest override alone when nothing else is set', () => {
    expect(formatDayExerciseTarget({ ...EMPTY, restSeconds: 60 })).toBe('Rest 60s');
  });
});
