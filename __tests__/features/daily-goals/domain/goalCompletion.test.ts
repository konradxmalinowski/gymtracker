import * as fc from 'fast-check';
import { isGoalComplete, type GoalType } from '@/features/daily-goals/domain/goalCompletion';

describe('isGoalComplete - boolean goals', () => {
  it('is incomplete at progress 0', () => {
    expect(isGoalComplete('boolean', null, 0)).toBe(false);
  });

  it('is complete at progress 1', () => {
    expect(isGoalComplete('boolean', null, 1)).toBe(true);
  });

  it('is complete at a progress value above 1 (defensive >=, not ===)', () => {
    expect(isGoalComplete('boolean', null, 2)).toBe(true);
  });

  it('ignores targetValue entirely, even if one is (incorrectly) present', () => {
    expect(isGoalComplete('boolean', 5, 1)).toBe(true);
    expect(isGoalComplete('boolean', 5, 0)).toBe(false);
  });
});

describe('isGoalComplete - counter/numeric goals', () => {
  it.each<GoalType>(['counter', 'numeric'])(
    '%s: incomplete below target, complete at and above it',
    (goalType) => {
      expect(isGoalComplete(goalType, 10, 9)).toBe(false);
      expect(isGoalComplete(goalType, 10, 10)).toBe(true);
      expect(isGoalComplete(goalType, 10, 11)).toBe(true);
    },
  );

  it.each<GoalType>(['counter', 'numeric'])(
    '%s: a null targetValue (schema-disallowed, but handled defensively) is never complete',
    (goalType) => {
      expect(isGoalComplete(goalType, null, 0)).toBe(false);
      expect(isGoalComplete(goalType, null, 1000)).toBe(false);
    },
  );
});

describe('isGoalComplete - properties', () => {
  it('counter/numeric: complete iff progressValue >= targetValue, whatever the magnitudes', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<GoalType>('counter', 'numeric'),
        fc.float({ min: Math.fround(0.01), max: 100_000, noNaN: true }),
        fc.float({ min: 0, max: 100_000, noNaN: true }),
        (goalType, targetValue, progressValue) => {
          expect(isGoalComplete(goalType, targetValue, progressValue)).toBe(
            progressValue >= targetValue,
          );
        },
      ),
    );
  });

  it('boolean: complete iff progressValue >= 1, independent of targetValue', () => {
    fc.assert(
      fc.property(
        fc.option(fc.float({ noNaN: true }), { nil: null }),
        fc.float({ min: -1000, max: 1000, noNaN: true }),
        (targetValue, progressValue) => {
          expect(isGoalComplete('boolean', targetValue, progressValue)).toBe(progressValue >= 1);
        },
      ),
    );
  });
});
