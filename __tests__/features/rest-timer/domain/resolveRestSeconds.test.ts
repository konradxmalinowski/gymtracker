import * as fc from 'fast-check';

import { resolveRestSeconds } from '@/features/rest-timer/domain/resolveRestSeconds';

/**
 * Three-tier precedence: exercise override, then plan day, then global
 * default. Property-based coverage per `docs/ARCHITECTURE.md` section 14
 * ("Domain layer: property-based tests for calculators") plus explicit
 * edge-case examples per this task's own instructions.
 */
describe('resolveRestSeconds - precedence table', () => {
  it('uses the exercise override when present, regardless of the other two tiers', () => {
    expect(
      resolveRestSeconds({
        exerciseDefaultSeconds: 45,
        planDaySeconds: 90,
        globalDefaultSeconds: 120,
      }),
    ).toBe(45);
  });

  it('falls back to the plan day value when there is no exercise override', () => {
    expect(
      resolveRestSeconds({
        exerciseDefaultSeconds: null,
        planDaySeconds: 90,
        globalDefaultSeconds: 120,
      }),
    ).toBe(90);
  });

  it('falls back to the global default when both tiers above it are null', () => {
    expect(
      resolveRestSeconds({
        exerciseDefaultSeconds: null,
        planDaySeconds: null,
        globalDefaultSeconds: 120,
      }),
    ).toBe(120);
  });

  it('all-null exercise/plan-day inputs still resolve to a real number via the global default', () => {
    const result = resolveRestSeconds({
      exerciseDefaultSeconds: null,
      planDaySeconds: null,
      globalDefaultSeconds: 60,
    });
    expect(result).toBe(60);
    expect(Number.isNaN(result)).toBe(false);
  });

  it('treats an exercise override of 0 as a real value, not as "unset" (0 !== null)', () => {
    expect(
      resolveRestSeconds({
        exerciseDefaultSeconds: 0,
        planDaySeconds: 90,
        globalDefaultSeconds: 120,
      }),
    ).toBe(0);
  });

  it('treats a plan day value of 0 as a real value, not as "unset"', () => {
    expect(
      resolveRestSeconds({
        exerciseDefaultSeconds: null,
        planDaySeconds: 0,
        globalDefaultSeconds: 120,
      }),
    ).toBe(0);
  });
});

describe('resolveRestSeconds - properties', () => {
  const secondsArb = fc.integer({ min: 0, max: 3600 });
  const optionalSecondsArb = fc.option(secondsArb, { nil: null });

  it('always resolves to a concrete, non-negative number, whatever the inputs', () => {
    fc.assert(
      fc.property(
        optionalSecondsArb,
        optionalSecondsArb,
        secondsArb,
        (exerciseDefaultSeconds, planDaySeconds, globalDefaultSeconds) => {
          const result = resolveRestSeconds({
            exerciseDefaultSeconds,
            planDaySeconds,
            globalDefaultSeconds,
          });
          expect(Number.isNaN(result)).toBe(false);
          expect(result).toBeGreaterThanOrEqual(0);
        },
      ),
    );
  });

  it('equals the exercise override whenever it is non-null, independent of the other two tiers', () => {
    fc.assert(
      fc.property(
        secondsArb,
        optionalSecondsArb,
        secondsArb,
        (exerciseDefaultSeconds, planDaySeconds, globalDefaultSeconds) => {
          expect(
            resolveRestSeconds({ exerciseDefaultSeconds, planDaySeconds, globalDefaultSeconds }),
          ).toBe(exerciseDefaultSeconds);
        },
      ),
    );
  });

  it('equals the plan day value whenever the exercise override is null and the plan day value is not', () => {
    fc.assert(
      fc.property(secondsArb, secondsArb, (planDaySeconds, globalDefaultSeconds) => {
        expect(
          resolveRestSeconds({
            exerciseDefaultSeconds: null,
            planDaySeconds,
            globalDefaultSeconds,
          }),
        ).toBe(planDaySeconds);
      }),
    );
  });

  it('equals the global default whenever both higher tiers are null', () => {
    fc.assert(
      fc.property(secondsArb, (globalDefaultSeconds) => {
        expect(
          resolveRestSeconds({
            exerciseDefaultSeconds: null,
            planDaySeconds: null,
            globalDefaultSeconds,
          }),
        ).toBe(globalDefaultSeconds);
      }),
    );
  });
});
