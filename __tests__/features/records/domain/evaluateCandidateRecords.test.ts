import * as fc from 'fast-check';

import { RECORD_ELIGIBLE_SET_TYPES, SET_TYPES } from '@/features/records/domain/Estimated1RM';
import {
  evaluateCandidateRecords,
  type CandidateSetInput,
} from '@/features/records/domain/evaluateCandidateRecords';
import {
  WEIGHT_AT_REPS_BUCKETS,
  type PersonalRecordSnapshot,
} from '@/features/records/types/PersonalRecord';

/**
 * ADR-0015 Decision 3's record-type table, pure-comparison half. `max_session_volume`
 * is intentionally never asserted here - it is out of scope for this function
 * (see the module's own header comment).
 */

const INELIGIBLE_SET_TYPES = SET_TYPES.filter((setType) => !RECORD_ELIGIBLE_SET_TYPES.has(setType));

function candidate(overrides: Partial<CandidateSetInput> = {}): CandidateSetInput {
  return {
    setType: 'normal',
    weightKg: null,
    reps: null,
    durationSeconds: null,
    distanceM: null,
    estimated1RmKg: null,
    ...overrides,
  };
}

function currentRecord(overrides: Partial<PersonalRecordSnapshot>): PersonalRecordSnapshot {
  return { recordType: 'max_weight', repBucket: null, value: 0, ...overrides };
}

describe('evaluateCandidateRecords - set-type eligibility', () => {
  it.each(INELIGIBLE_SET_TYPES)(
    'returns no beaten records for ineligible set type %s, no matter the values',
    (setType) => {
      const result = evaluateCandidateRecords(
        [],
        candidate({
          setType: setType as CandidateSetInput['setType'],
          weightKg: 999,
          reps: 20,
          durationSeconds: 999,
          distanceM: 999,
          estimated1RmKg: 999,
        }),
      );
      expect(result).toEqual([]);
    },
  );

  it.each(['normal', 'failure'] as const)(
    'evaluates records for eligible set type %s',
    (setType) => {
      const result = evaluateCandidateRecords([], candidate({ setType, weightKg: 100, reps: 5 }));
      expect(result.length).toBeGreaterThan(0);
    },
  );
});

describe('evaluateCandidateRecords - first-ever PR (no current records)', () => {
  it('every eligible field trivially beats the (absent) record', () => {
    const result = evaluateCandidateRecords(
      [],
      candidate({
        weightKg: 100,
        reps: 5,
        durationSeconds: 60,
        distanceM: 1000,
        estimated1RmKg: 116.67,
      }),
    );
    const beatenTypes = result.map((r) => r.recordType).sort();
    expect(beatenTypes).toEqual(
      [
        'estimated_1rm',
        'max_distance',
        'max_duration',
        'max_reps',
        'max_set_volume',
        'max_weight',
        'weight_at_reps',
      ].sort(),
    );
  });
});

describe('evaluateCandidateRecords - max_weight', () => {
  it('beats a lower current max_weight', () => {
    const result = evaluateCandidateRecords(
      [currentRecord({ recordType: 'max_weight', value: 90 })],
      candidate({ weightKg: 100, reps: 5 }),
    );
    expect(result).toContainEqual({ recordType: 'max_weight', repBucket: null, newValue: 100 });
  });

  it('does not beat an equal current max_weight (tie rule)', () => {
    const result = evaluateCandidateRecords(
      [currentRecord({ recordType: 'max_weight', value: 100 })],
      candidate({ weightKg: 100, reps: 5 }),
    );
    expect(result.find((r) => r.recordType === 'max_weight')).toBeUndefined();
  });

  it('does not beat a higher current max_weight', () => {
    const result = evaluateCandidateRecords(
      [currentRecord({ recordType: 'max_weight', value: 110 })],
      candidate({ weightKg: 100, reps: 5 }),
    );
    expect(result.find((r) => r.recordType === 'max_weight')).toBeUndefined();
  });

  it('is not evaluated when weightKg is null or non-positive', () => {
    for (const weightKg of [null, 0, -5]) {
      const result = evaluateCandidateRecords([], candidate({ weightKg, reps: 5 }));
      expect(result.find((r) => r.recordType === 'max_weight')).toBeUndefined();
    }
  });
});

describe('evaluateCandidateRecords - max_reps', () => {
  it('beats a lower current max_reps, independent of weight', () => {
    const result = evaluateCandidateRecords(
      [currentRecord({ recordType: 'max_reps', value: 10 })],
      candidate({ weightKg: null, reps: 15 }),
    );
    expect(result).toContainEqual({ recordType: 'max_reps', repBucket: null, newValue: 15 });
  });

  it('is not evaluated when reps is null or non-positive', () => {
    for (const reps of [null, 0, -5]) {
      const result = evaluateCandidateRecords([], candidate({ reps }));
      expect(result.find((r) => r.recordType === 'max_reps')).toBeUndefined();
    }
  });
});

describe('evaluateCandidateRecords - weight_at_reps buckets', () => {
  it.each(WEIGHT_AT_REPS_BUCKETS)(
    'sets a weight_at_reps PR for exactly bucket %s reps',
    (bucket) => {
      const result = evaluateCandidateRecords([], candidate({ weightKg: 80, reps: bucket }));
      expect(result).toContainEqual({
        recordType: 'weight_at_reps',
        repBucket: bucket,
        newValue: 80,
      });
    },
  );

  it('does not set a weight_at_reps PR for a non-bucket rep count (e.g. 6)', () => {
    const result = evaluateCandidateRecords([], candidate({ weightKg: 80, reps: 6 }));
    expect(result.find((r) => r.recordType === 'weight_at_reps')).toBeUndefined();
  });

  it('a bucket PR is scoped to its own bucket - beating the 5-rep record does not touch the 8-rep one', () => {
    const current: PersonalRecordSnapshot[] = [
      { recordType: 'weight_at_reps', repBucket: 5, value: 100 },
      { recordType: 'weight_at_reps', repBucket: 8, value: 90 },
      currentRecord({ recordType: 'max_weight', value: 999 }),
      currentRecord({ recordType: 'max_reps', value: 999 }),
      currentRecord({ recordType: 'max_set_volume', value: 999_999 }),
    ];
    const result = evaluateCandidateRecords(current, candidate({ weightKg: 110, reps: 5 }));
    expect(result).toEqual([{ recordType: 'weight_at_reps', repBucket: 5, newValue: 110 }]);
  });
});

describe('evaluateCandidateRecords - max_set_volume', () => {
  it('computes weight * reps and beats a lower current volume', () => {
    const result = evaluateCandidateRecords(
      [currentRecord({ recordType: 'max_set_volume', value: 400 })],
      candidate({ weightKg: 50, reps: 10 }),
    );
    expect(result).toContainEqual({ recordType: 'max_set_volume', repBucket: null, newValue: 500 });
  });

  it('is not evaluated when either weight or reps is missing', () => {
    expect(
      evaluateCandidateRecords([], candidate({ weightKg: 50, reps: null })).find(
        (r) => r.recordType === 'max_set_volume',
      ),
    ).toBeUndefined();
    expect(
      evaluateCandidateRecords([], candidate({ weightKg: null, reps: 10 })).find(
        (r) => r.recordType === 'max_set_volume',
      ),
    ).toBeUndefined();
  });
});

describe('evaluateCandidateRecords - estimated_1rm', () => {
  it('uses the pre-computed estimated1RmKg field directly, never recomputing it', () => {
    const result = evaluateCandidateRecords(
      [currentRecord({ recordType: 'estimated_1rm', value: 100 })],
      candidate({ weightKg: 1, reps: 1, estimated1RmKg: 150 }),
    );
    expect(result).toContainEqual({ recordType: 'estimated_1rm', repBucket: null, newValue: 150 });
  });

  it('is not evaluated when estimated1RmKg is null', () => {
    const result = evaluateCandidateRecords([], candidate({ estimated1RmKg: null }));
    expect(result.find((r) => r.recordType === 'estimated_1rm')).toBeUndefined();
  });
});

describe('evaluateCandidateRecords - max_duration / max_distance', () => {
  it('beats a lower current duration', () => {
    const result = evaluateCandidateRecords(
      [currentRecord({ recordType: 'max_duration', value: 30 })],
      candidate({ durationSeconds: 45 }),
    );
    expect(result).toContainEqual({ recordType: 'max_duration', repBucket: null, newValue: 45 });
  });

  it('beats a lower current distance', () => {
    const result = evaluateCandidateRecords(
      [currentRecord({ recordType: 'max_distance', value: 1000 })],
      candidate({ distanceM: 2000 }),
    );
    expect(result).toContainEqual({ recordType: 'max_distance', repBucket: null, newValue: 2000 });
  });
});

describe('evaluateCandidateRecords - max_session_volume is out of scope', () => {
  it('never appears in the result, regardless of input', () => {
    const result = evaluateCandidateRecords(
      [],
      candidate({
        weightKg: 999,
        reps: 999,
        durationSeconds: 999,
        distanceM: 999,
        estimated1RmKg: 999,
      }),
    );
    expect(result.find((r) => (r.recordType as string) === 'max_session_volume')).toBeUndefined();
  });
});

describe('evaluateCandidateRecords - properties', () => {
  const eligibleSetTypeArb = fc.constantFrom('normal', 'failure' as const);
  const positiveArb = fc.double({ min: 0.01, max: 1000, noNaN: true });
  const repsArb = fc.integer({ min: 1, max: 100 });

  const candidateArb = fc.record({
    setType: eligibleSetTypeArb,
    weightKg: fc.option(positiveArb, { nil: null }),
    reps: fc.option(repsArb, { nil: null }),
    durationSeconds: fc.option(positiveArb, { nil: null }),
    distanceM: fc.option(positiveArb, { nil: null }),
    estimated1RmKg: fc.option(positiveArb, { nil: null }),
  });

  it("every beaten record's newValue is always exactly the corresponding input field", () => {
    fc.assert(
      fc.property(candidateArb, (input) => {
        const result = evaluateCandidateRecords([], input);
        for (const beaten of result) {
          switch (beaten.recordType) {
            case 'max_weight':
            case 'weight_at_reps':
              expect(beaten.newValue).toBe(input.weightKg);
              break;
            case 'max_reps':
              expect(beaten.newValue).toBe(input.reps);
              break;
            case 'max_set_volume':
              expect(beaten.newValue).toBe(input.weightKg! * input.reps!);
              break;
            case 'estimated_1rm':
              expect(beaten.newValue).toBe(input.estimated1RmKg);
              break;
            case 'max_duration':
              expect(beaten.newValue).toBe(input.durationSeconds);
              break;
            case 'max_distance':
              expect(beaten.newValue).toBe(input.distanceM);
              break;
            default:
              throw new Error(`unexpected record type in result: ${beaten.recordType as string}`);
          }
        }
      }),
    );
  });

  it('a candidate that exactly ties every eligible current record never beats it (documented tie rule)', () => {
    fc.assert(
      fc.property(candidateArb, (input) => {
        const currentRecords: PersonalRecordSnapshot[] = [];
        if (input.weightKg !== null) {
          currentRecords.push(currentRecord({ recordType: 'max_weight', value: input.weightKg }));
          const bucket = WEIGHT_AT_REPS_BUCKETS.find((value) => value === input.reps);
          if (bucket !== undefined) {
            currentRecords.push({
              recordType: 'weight_at_reps',
              repBucket: bucket,
              value: input.weightKg,
            });
          }
        }
        if (input.reps !== null) {
          currentRecords.push(currentRecord({ recordType: 'max_reps', value: input.reps }));
        }
        if (input.weightKg !== null && input.reps !== null) {
          currentRecords.push(
            currentRecord({ recordType: 'max_set_volume', value: input.weightKg * input.reps }),
          );
        }
        if (input.estimated1RmKg !== null) {
          currentRecords.push(
            currentRecord({ recordType: 'estimated_1rm', value: input.estimated1RmKg }),
          );
        }
        if (input.durationSeconds !== null) {
          currentRecords.push(
            currentRecord({ recordType: 'max_duration', value: input.durationSeconds }),
          );
        }
        if (input.distanceM !== null) {
          currentRecords.push(
            currentRecord({ recordType: 'max_distance', value: input.distanceM }),
          );
        }
        const result = evaluateCandidateRecords(currentRecords, input);
        expect(result).toEqual([]);
      }),
    );
  });

  it('is always empty for an ineligible set type', () => {
    fc.assert(
      fc.property(fc.constantFrom(...INELIGIBLE_SET_TYPES), candidateArb, (setType, input) => {
        const result = evaluateCandidateRecords([], {
          ...input,
          setType: setType as CandidateSetInput['setType'],
        });
        expect(result).toEqual([]);
      }),
    );
  });
});
