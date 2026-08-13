import * as fc from 'fast-check';

import {
  LOWER_BODY_PARTS,
  suggestNextProgression,
  UPPER_BODY_PARTS,
  type ProgressionAdviceInput,
  type WorkingSetPerformance,
} from '@/features/records/domain/ProgressionAdvisor';

/**
 * ADR-0015 Decision 2: double progression, five branches (ROADMAP.md's own
 * naming): first-time / no-target-range / hit-max / below-min / otherwise.
 */

const DEFAULT_INCREMENTS = { upperIncrementKg: 2.5, lowerIncrementKg: 5 };

function baseInput(overrides: Partial<ProgressionAdviceInput> = {}): ProgressionAdviceInput {
  return {
    lastSessionWorkingSets: [],
    targetRepRange: null,
    primaryMuscleBodyPart: 'back',
    equipmentSlug: 'barbell',
    increments: DEFAULT_INCREMENTS,
    ...overrides,
  };
}

function sets(...pairs: [weightKg: number, reps: number][]): WorkingSetPerformance[] {
  return pairs.map(([weightKg, reps]) => ({ weightKg, reps }));
}

describe('suggestNextProgression - branch 1: no history -> first_time', () => {
  it('returns first_time when there are no working sets at all', () => {
    expect(suggestNextProgression(baseInput({ lastSessionWorkingSets: [] }))).toEqual({
      kind: 'first_time',
    });
  });
});

describe('suggestNextProgression - branch 2: no target rep range -> derived +/- 2', () => {
  it('derives targetRepMin/targetRepMax from the minimum reps of the last session, then evaluates against it', () => {
    // min reps = 8 across the session -> derived range [6, 10]. 8 is within
    // range (not >= 10, not < 6) -> falls into the "otherwise" branch, reps = 8 + 1.
    const result = suggestNextProgression(
      baseInput({
        targetRepRange: null,
        lastSessionWorkingSets: sets([100, 8], [100, 9]),
      }),
    );
    expect(result).toEqual({
      kind: 'increase_reps',
      weightKg: 100,
      reps: 9,
      usedRepRange: { targetRepMin: 6, targetRepMax: 10 },
    });
  });

  it('clamps the derived targetRepMin to at least 1 rep', () => {
    const result = suggestNextProgression(
      baseInput({ targetRepRange: null, lastSessionWorkingSets: sets([20, 1]) }),
    );
    expect(result.kind).not.toBe('first_time');
    if (result.kind !== 'first_time') {
      expect(result.usedRepRange.targetRepMin).toBe(1);
      expect(result.usedRepRange.targetRepMax).toBe(3);
    }
  });
});

describe('suggestNextProgression - branch 3: every working set hit target_rep_max -> weight + increment, reps = target_rep_min', () => {
  it('suggests weight + upper increment for an upper-body exercise', () => {
    const result = suggestNextProgression(
      baseInput({
        targetRepRange: { targetRepMin: 8, targetRepMax: 12 },
        lastSessionWorkingSets: sets([60, 12], [60, 13]),
        primaryMuscleBodyPart: 'back',
        equipmentSlug: 'barbell',
      }),
    );
    expect(result).toEqual({
      kind: 'increase_weight',
      weightKg: 62.5,
      reps: 8,
      usedRepRange: { targetRepMin: 8, targetRepMax: 12 },
    });
  });

  it('suggests weight + lower increment for a lower-body exercise', () => {
    const result = suggestNextProgression(
      baseInput({
        targetRepRange: { targetRepMin: 5, targetRepMax: 8 },
        lastSessionWorkingSets: sets([100, 8], [100, 8]),
        primaryMuscleBodyPart: 'legs',
        equipmentSlug: 'barbell',
      }),
    );
    expect(result).toEqual({
      kind: 'increase_weight',
      weightKg: 105,
      reps: 5,
      usedRepRange: { targetRepMin: 5, targetRepMax: 8 },
    });
  });

  it('snaps the suggested weight to the nearest 2 kg for dumbbell exercises', () => {
    const result = suggestNextProgression(
      baseInput({
        targetRepRange: { targetRepMin: 8, targetRepMax: 12 },
        lastSessionWorkingSets: sets([21, 12]),
        primaryMuscleBodyPart: 'shoulders',
        equipmentSlug: 'dumbbell',
        increments: { upperIncrementKg: 2.5, lowerIncrementKg: 5 },
      }),
    );
    // 21 + 2.5 = 23.5 -> snaps to nearest 2kg -> 24.
    expect(result).toMatchObject({ kind: 'increase_weight', weightKg: 24 });
  });

  it('does not snap non-dumbbell equipment', () => {
    const result = suggestNextProgression(
      baseInput({
        targetRepRange: { targetRepMin: 8, targetRepMax: 12 },
        lastSessionWorkingSets: sets([21, 12]),
        equipmentSlug: 'barbell',
      }),
    );
    expect(result).toMatchObject({ kind: 'increase_weight', weightKg: 23.5 });
  });
});

describe('suggestNextProgression - branch 4: any working set below target_rep_min -> repeat', () => {
  it('suggests the same weight and the reps actually achieved (the weakest set)', () => {
    const result = suggestNextProgression(
      baseInput({
        targetRepRange: { targetRepMin: 8, targetRepMax: 12 },
        lastSessionWorkingSets: sets([80, 10], [80, 6]),
      }),
    );
    expect(result).toEqual({
      kind: 'repeat',
      weightKg: 80,
      reps: 6,
      usedRepRange: { targetRepMin: 8, targetRepMax: 12 },
    });
  });
});

describe('suggestNextProgression - branch 5: otherwise -> same weight, reps = last + 1', () => {
  it('suggests one more rep at the same weight when within range but not every set hit the max', () => {
    const result = suggestNextProgression(
      baseInput({
        targetRepRange: { targetRepMin: 8, targetRepMax: 12 },
        lastSessionWorkingSets: sets([80, 10], [80, 9]),
      }),
    );
    expect(result).toEqual({
      kind: 'increase_reps',
      weightKg: 80,
      reps: 10,
      usedRepRange: { targetRepMin: 8, targetRepMax: 12 },
    });
  });
});

describe('suggestNextProgression - upper/lower body part mapping', () => {
  it.each(UPPER_BODY_PARTS)('%s uses the upper increment', (bodyPart) => {
    const result = suggestNextProgression(
      baseInput({
        targetRepRange: { targetRepMin: 8, targetRepMax: 10 },
        lastSessionWorkingSets: sets([50, 10]),
        primaryMuscleBodyPart: bodyPart,
        equipmentSlug: 'barbell',
        increments: { upperIncrementKg: 2.5, lowerIncrementKg: 5 },
      }),
    );
    expect(result).toMatchObject({ kind: 'increase_weight', weightKg: 52.5 });
  });

  it.each(LOWER_BODY_PARTS)('%s uses the lower increment', (bodyPart) => {
    const result = suggestNextProgression(
      baseInput({
        targetRepRange: { targetRepMin: 8, targetRepMax: 10 },
        lastSessionWorkingSets: sets([50, 10]),
        primaryMuscleBodyPart: bodyPart,
        equipmentSlug: 'barbell',
        increments: { upperIncrementKg: 2.5, lowerIncrementKg: 5 },
      }),
    );
    expect(result).toMatchObject({ kind: 'increase_weight', weightKg: 55 });
  });

  it('falls back to the upper increment when the primary muscle body part is unknown (null)', () => {
    const result = suggestNextProgression(
      baseInput({
        targetRepRange: { targetRepMin: 8, targetRepMax: 10 },
        lastSessionWorkingSets: sets([50, 10]),
        primaryMuscleBodyPart: null,
        equipmentSlug: 'barbell',
        increments: { upperIncrementKg: 2.5, lowerIncrementKg: 5 },
      }),
    );
    expect(result).toMatchObject({ kind: 'increase_weight', weightKg: 52.5 });
  });
});

describe('suggestNextProgression - properties', () => {
  const workingSetArb = fc.record({
    weightKg: fc.double({ min: 1, max: 300, noNaN: true }),
    reps: fc.integer({ min: 1, max: 30 }),
  });
  const nonEmptySetsArb = fc.array(workingSetArb, { minLength: 1, maxLength: 6 });
  const repRangeArb = fc
    .tuple(fc.integer({ min: 1, max: 20 }), fc.integer({ min: 0, max: 10 }))
    .map(([min, spread]) => ({ targetRepMin: min, targetRepMax: min + spread }));

  it('increase_weight never suggests less than the last performed weight', () => {
    fc.assert(
      fc.property(nonEmptySetsArb, repRangeArb, (setsList, targetRepRange) => {
        const result = suggestNextProgression(
          baseInput({ lastSessionWorkingSets: setsList, targetRepRange, equipmentSlug: 'barbell' }),
        );
        if (result.kind === 'increase_weight') {
          const lastWeight = setsList[setsList.length - 1]!.weightKg;
          expect(result.weightKg).toBeGreaterThanOrEqual(lastWeight);
        }
      }),
    );
  });

  it('repeat and increase_reps never change the weight from the last performed weight', () => {
    fc.assert(
      fc.property(nonEmptySetsArb, repRangeArb, (setsList, targetRepRange) => {
        const result = suggestNextProgression(
          baseInput({ lastSessionWorkingSets: setsList, targetRepRange }),
        );
        if (result.kind === 'repeat' || result.kind === 'increase_reps') {
          expect(result.weightKg).toBe(setsList[setsList.length - 1]!.weightKg);
        }
      }),
    );
  });

  it('always produces one of the four known suggestion kinds', () => {
    fc.assert(
      fc.property(
        fc.array(workingSetArb, { maxLength: 6 }),
        repRangeArb,
        (setsList, targetRepRange) => {
          const result = suggestNextProgression(
            baseInput({ lastSessionWorkingSets: setsList, targetRepRange }),
          );
          expect(['first_time', 'increase_weight', 'repeat', 'increase_reps']).toContain(
            result.kind,
          );
        },
      ),
    );
  });
});
