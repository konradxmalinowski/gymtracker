import { epleyFormula, estimated1RM } from '@/features/records';
import {
  reduceExerciseProgression,
  type ExerciseWorkingSetPoint,
} from '@/features/statistics/domain/exerciseProgressionReducer';

function point(overrides: Partial<ExerciseWorkingSetPoint>): ExerciseWorkingSetPoint {
  return {
    localDate: '2026-08-18',
    weightKg: 100,
    reps: 5,
    setType: 'normal',
    volumeKg: 500,
    ...overrides,
  };
}

const ONE_BOUNDARY = ['2026-08-18'];

describe('reduceExerciseProgression', () => {
  it('every boundary with no points reduces to null for top_set/e1rm', () => {
    const result = reduceExerciseProgression([], ONE_BOUNDARY, 'day', 'top_set', epleyFormula);
    expect(result).toEqual([{ bucketStart: '2026-08-18', value: null }]);
  });

  it('every boundary with no points reduces to 0 for volume', () => {
    const result = reduceExerciseProgression([], ONE_BOUNDARY, 'day', 'volume', epleyFormula);
    expect(result).toEqual([{ bucketStart: '2026-08-18', value: 0 }]);
  });

  it('volume sums every point in the bucket regardless of set type', () => {
    const points = [
      point({ volumeKg: 500 }),
      point({ setType: 'warmup', weightKg: 40, reps: 10, volumeKg: 0 }),
      point({ volumeKg: 300 }),
    ];
    const result = reduceExerciseProgression(points, ONE_BOUNDARY, 'day', 'volume', epleyFormula);
    expect(result).toEqual([{ bucketStart: '2026-08-18', value: 800 }]);
  });

  it('top_set takes the max weight among record-eligible sets only', () => {
    const points = [
      point({ weightKg: 100, setType: 'normal' }),
      point({ weightKg: 140, setType: 'warmup' }), // heavier but ineligible - excluded
      point({ weightKg: 120, setType: 'failure' }),
    ];
    const result = reduceExerciseProgression(points, ONE_BOUNDARY, 'day', 'top_set', epleyFormula);
    expect(result).toEqual([{ bucketStart: '2026-08-18', value: 120 }]);
  });

  it('top_set ignores sets with a null weight or reps', () => {
    const points = [point({ weightKg: null }), point({ reps: null })];
    const result = reduceExerciseProgression(points, ONE_BOUNDARY, 'day', 'top_set', epleyFormula);
    expect(result).toEqual([{ bucketStart: '2026-08-18', value: null }]);
  });

  it('e1rm takes the highest estimated 1RM among eligible sets, which is not always the heaviest set', () => {
    // 5x100kg (Epley e1RM ~116.7) vs 1x110kg (e1RM = 110) - the higher-rep,
    // lighter set wins on e1RM despite the other set being heavier.
    const points = [point({ weightKg: 100, reps: 5 }), point({ weightKg: 110, reps: 1 })];
    const result = reduceExerciseProgression(points, ONE_BOUNDARY, 'day', 'e1rm', epleyFormula);
    const expected = estimated1RM({ weightKg: 100, reps: 5, setType: 'normal' }, epleyFormula);
    expect(result[0]!.value).toBeCloseTo(expected!, 5);
    expect(result[0]!.value).toBeGreaterThan(110);
  });

  it('e1rm is null when every eligible set is above the 12-rep guard rail', () => {
    const points = [point({ reps: 15 })];
    const result = reduceExerciseProgression(points, ONE_BOUNDARY, 'day', 'e1rm', epleyFormula);
    expect(result).toEqual([{ bucketStart: '2026-08-18', value: null }]);
  });

  it('assisted and partial sets are never eligible for top_set/e1rm', () => {
    const points = [point({ setType: 'assisted' }), point({ setType: 'partial' })];
    expect(reduceExerciseProgression(points, ONE_BOUNDARY, 'day', 'top_set', epleyFormula)).toEqual(
      [{ bucketStart: '2026-08-18', value: null }],
    );
    expect(reduceExerciseProgression(points, ONE_BOUNDARY, 'day', 'e1rm', epleyFormula)).toEqual([
      { bucketStart: '2026-08-18', value: null },
    ]);
  });

  it('routes points into the correct bucket via bucketStartFor', () => {
    // 2026-08-17 and 2026-08-24 are both Mondays (ISO week starts);
    // 2026-08-19/2026-08-26 fall inside those weeks respectively.
    const boundaries = ['2026-08-17', '2026-08-24'];
    const points = [
      point({ localDate: '2026-08-19', weightKg: 90 }),
      point({ localDate: '2026-08-26', weightKg: 100 }),
    ];
    const result = reduceExerciseProgression(points, boundaries, 'week', 'top_set', epleyFormula);
    expect(result).toEqual([
      { bucketStart: '2026-08-17', value: 90 },
      { bucketStart: '2026-08-24', value: 100 },
    ]);
  });
});
