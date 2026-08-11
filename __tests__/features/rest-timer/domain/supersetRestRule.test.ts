import * as fc from 'fast-check';

import {
  shouldStartRestTimer,
  type SupersetSessionExercise,
} from '@/features/rest-timer/domain/supersetRestRule';

function exercise(overrides: Partial<SupersetSessionExercise>): SupersetSessionExercise {
  return {
    sessionExerciseId: 'se-1',
    supersetGroup: null,
    sortOrder: 0,
    isDeleted: false,
    ...overrides,
  };
}

/**
 * D-03 / ADR-0006: a standalone exercise always starts a timer; within a
 * superset group only the last non-deleted member (by `sortOrder`) does.
 * Property-based coverage per `docs/ARCHITECTURE.md` section 14, plus the
 * explicit edge cases this task calls out (all-null-ish inputs, a group with
 * one remaining member, an unknown completed id).
 */
describe('shouldStartRestTimer - examples', () => {
  it('a standalone exercise (supersetGroup null) always starts a timer', () => {
    const sessionExercises = [exercise({ sessionExerciseId: 'se-1', supersetGroup: null })];
    expect(shouldStartRestTimer({ completedSessionExerciseId: 'se-1', sessionExercises })).toBe(
      true,
    );
  });

  it('completing the last member (by sortOrder) of a group starts a timer', () => {
    const sessionExercises = [
      exercise({ sessionExerciseId: 'se-1', supersetGroup: 1, sortOrder: 0 }),
      exercise({ sessionExerciseId: 'se-2', supersetGroup: 1, sortOrder: 1 }),
    ];
    expect(shouldStartRestTimer({ completedSessionExerciseId: 'se-2', sessionExercises })).toBe(
      true,
    );
  });

  it('completing a non-last member of a group does not start a timer', () => {
    const sessionExercises = [
      exercise({ sessionExerciseId: 'se-1', supersetGroup: 1, sortOrder: 0 }),
      exercise({ sessionExerciseId: 'se-2', supersetGroup: 1, sortOrder: 1 }),
    ];
    expect(shouldStartRestTimer({ completedSessionExerciseId: 'se-1', sessionExercises })).toBe(
      false,
    );
  });

  it('a group with one non-deleted member left (the other was removed mid-workout) starts a timer', () => {
    const sessionExercises = [
      exercise({ sessionExerciseId: 'se-1', supersetGroup: 1, sortOrder: 0, isDeleted: true }),
      exercise({ sessionExerciseId: 'se-2', supersetGroup: 1, sortOrder: 1, isDeleted: false }),
    ];
    expect(shouldStartRestTimer({ completedSessionExerciseId: 'se-2', sessionExercises })).toBe(
      true,
    );
  });

  it('a group where every other member was later added after the completed one still resolves off sortOrder, not array position', () => {
    const sessionExercises = [
      exercise({ sessionExerciseId: 'se-2', supersetGroup: 1, sortOrder: 1 }),
      exercise({ sessionExerciseId: 'se-1', supersetGroup: 1, sortOrder: 0 }),
    ];
    expect(shouldStartRestTimer({ completedSessionExerciseId: 'se-1', sessionExercises })).toBe(
      false,
    );
    expect(shouldStartRestTimer({ completedSessionExerciseId: 'se-2', sessionExercises })).toBe(
      true,
    );
  });

  it('fails open (returns true) when the completed id is not found in sessionExercises at all', () => {
    const sessionExercises = [exercise({ sessionExerciseId: 'se-1', supersetGroup: 1 })];
    expect(
      shouldStartRestTimer({ completedSessionExerciseId: 'does-not-exist', sessionExercises }),
    ).toBe(true);
  });

  it('fails open (returns true) for an empty sessionExercises list', () => {
    expect(shouldStartRestTimer({ completedSessionExerciseId: 'se-1', sessionExercises: [] })).toBe(
      true,
    );
  });
});

describe('shouldStartRestTimer - properties', () => {
  const GROUP_IDS = [1, 2, 3] as const;

  /** One randomized workout's worth of session exercises: unique ids, strictly increasing sortOrder (so "last by sortOrder" is unambiguous), a random group (or standalone), random deletion. */
  const workoutArb = fc
    .array(
      fc.record({
        group: fc.option(fc.constantFrom(...GROUP_IDS), { nil: null }),
        isDeleted: fc.boolean(),
      }),
      { minLength: 1, maxLength: 10 },
    )
    .map((entries) =>
      entries.map((entry, index): SupersetSessionExercise => ({
        sessionExerciseId: `se-${index}`,
        supersetGroup: entry.group,
        sortOrder: index,
        isDeleted: entry.isDeleted,
      })),
    );

  it('a standalone member always starts a timer, deleted or not', () => {
    fc.assert(
      fc.property(workoutArb, (sessionExercises) => {
        for (const candidate of sessionExercises) {
          if (candidate.supersetGroup === null) {
            expect(
              shouldStartRestTimer({
                completedSessionExerciseId: candidate.sessionExerciseId,
                sessionExercises,
              }),
            ).toBe(true);
          }
        }
      }),
    );
  });

  it('within any group, exactly the highest-sortOrder non-deleted member starts a timer among non-deleted candidates', () => {
    fc.assert(
      fc.property(workoutArb, (sessionExercises) => {
        for (const groupId of GROUP_IDS) {
          const nonDeletedMembers = sessionExercises.filter(
            (exercise) => exercise.supersetGroup === groupId && !exercise.isDeleted,
          );
          if (nonDeletedMembers.length === 0) {
            continue;
          }
          const expectedLast = nonDeletedMembers.reduce((latest, exercise) =>
            exercise.sortOrder > latest.sortOrder ? exercise : latest,
          );
          for (const member of nonDeletedMembers) {
            const result = shouldStartRestTimer({
              completedSessionExerciseId: member.sessionExerciseId,
              sessionExercises,
            });
            expect(result).toBe(member.sessionExerciseId === expectedLast.sessionExerciseId);
          }
        }
      }),
    );
  });

  it('an unknown completed id always fails open to true, whatever the rest of the workout looks like', () => {
    fc.assert(
      fc.property(workoutArb, (sessionExercises) => {
        expect(
          shouldStartRestTimer({
            completedSessionExerciseId: 'never-appears-in-this-workout',
            sessionExercises,
          }),
        ).toBe(true);
      }),
    );
  });
});
