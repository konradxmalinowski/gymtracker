import { useQueries } from '@tanstack/react-query';

import { formatExerciseName } from '@/features/exercise-library';
import { useContainer } from '@/services/container';

/**
 * Resolves display names for a set of `PersonalRecord.exerciseId`s.
 * `PersonalRecord` (`features/records/repository/PersonalRecordRepository.ts`)
 * deliberately carries only the id, no name - the repository/service layer
 * has no reason to duplicate `exercise.name_en`/`name_pl` into every record
 * row. `PersonalRecordsScreen` is the one caller that needs names for a list
 * of records spanning many exercises.
 *
 * This is the one place `records` reaches into `exercise-library`'s barrel.
 * ARCHITECTURE.md section 9.1's module dependency graph states
 * `exercise-library` is a leaf (no dependency of its own) and that `records`
 * must not depend on `workout-logging` - it says nothing that forbids
 * `records` depending on the leaf `exercise-library`, and doing so cannot
 * create a cycle (a leaf has nothing to depend back with). Kept narrow and
 * documented here rather than a silent assumption.
 */
export function useRecordExerciseNames(exerciseIds: readonly string[]) {
  const { exerciseService } = useContainer();
  const uniqueIds = Array.from(new Set(exerciseIds));

  const queries = useQueries({
    queries: uniqueIds.map((id) => ({
      queryKey: ['records', 'exerciseName', id] as const,
      queryFn: async () => {
        const exercise = await exerciseService.getById(id);
        return exercise
          ? formatExerciseName({
              nameEn: exercise.nameEn,
              namePl: exercise.namePl,
              displayNameOverride: exercise.userData.displayNameOverride,
            })
          : null;
      },
    })),
  });

  const names = new Map<string, string | null>();
  uniqueIds.forEach((id, index) => {
    names.set(id, queries[index]?.data ?? null);
  });

  return {
    names,
    isPending: queries.some((query) => query.isPending),
  };
}
