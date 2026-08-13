import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  isRecordEligibleSetType,
  suggestNextProgression,
  type ProgressionSuggestion,
} from '@/features/records';
import type { EntityId } from '@/repositories/contracts/repository';
import type { SettingsRepository } from '@/repositories/settings';

import type {
  ExerciseHistoryRepository,
  PreviousPerformance,
} from '../repository/ExerciseHistoryRepository';

/**
 * `ExerciseHistoryRepository` (P8 pass 2) is read-only and deliberately has
 * no accompanying service (`services/container.ts`'s own doc comment: "the
 * same 'no service layer' shape `StatisticsRepository` is expected to have")
 * - these hooks are the presentation-facing wrapper for it.
 *
 * Both hooks take their repository/settings dependencies as parameters
 * rather than calling `useContainer()` internally - the same reason
 * `features/records/hooks/useRecords.ts` does (see that file's header
 * comment): this file is re-exported through `features/workout-logging/
 * index.ts`, and `services/container.ts` itself imports
 * `WorkoutSessionService` from that same barrel, so a hook here that
 * imported `@/services/container` directly would close a real cycle. Callers
 * (`SessionExerciseCard.tsx`, `app/(tabs)/exercises/[id].tsx`) already call
 * `useContainer()` themselves and pass the pieces down - mirroring
 * `useStartWorkout(sessionService)`'s existing precedent in this same
 * barrel.
 */
export const exerciseHistoryKeys = {
  previous: (exerciseId: EntityId, beforeSessionId?: EntityId) =>
    [
      'workout-logging',
      'exerciseHistory',
      'previous',
      exerciseId,
      beforeSessionId ?? null,
    ] as const,
};

/** FR-15's "previous weight, previous reps" read path - `PreviousPerformancePanel`'s data source. */
export function usePreviousPerformance(
  exerciseHistoryRepository: ExerciseHistoryRepository,
  exerciseId: EntityId | undefined,
  beforeSessionId?: EntityId,
) {
  return useQuery({
    queryKey: exerciseHistoryKeys.previous(exerciseId ?? '', beforeSessionId),
    queryFn: () =>
      exerciseHistoryRepository.getPreviousPerformance(exerciseId as EntityId, beforeSessionId),
    enabled: Boolean(exerciseId),
  });
}

export interface UseProgressionSuggestionDependencies {
  exerciseHistoryRepository: ExerciseHistoryRepository;
  settings: SettingsRepository;
}

export interface UseProgressionSuggestionInput {
  exerciseId: EntityId | undefined;
  /** `exercise.bodyPart`/`exercise.equipmentSlug` off `SessionExercise.exercise` (an `ExerciseListItem`) - `exercise.body_part` is derived at catalog-build time from the exercise's primary muscle's `muscle.body_part` (`scripts/build-catalog.ts`), so it already carries the value `ProgressionAdvisor.primaryMuscleBodyPart` wants; no separate `exercise_muscle` query is needed. */
  primaryMuscleBodyPart: string | null;
  equipmentSlug: string | null;
  /** The in-progress session's own id, so "previous performance" excludes a set logged earlier today in this same session. `undefined` outside an active workout (e.g. the exercise-detail slot). */
  beforeSessionId?: EntityId;
}

/**
 * ADR-0015 Decision 2's double-progression suggestion, assembled here (not in
 * `records`, which must stay a leaf with no `workout-logging` dependency):
 * reads the previous session's working sets via `usePreviousPerformance`,
 * reads `progression.upperIncrementKg`/`lowerIncrementKg` from settings, and
 * calls `suggestNextProgression` (imported through the `records` barrel -
 * the allowed `workout-logging -> records` direction).
 *
 * `targetRepRange` is always passed as `null`: `SessionExercise`
 * (`features/workout-logging/repository/WorkoutSessionRepository.ts`, Pass
 * 2's contract) carries no `target_rep_min`/`target_rep_max` fields - Pass 2
 * did not thread the plan day's rep range onto the in-session exercise, and
 * extending that repository/contract is outside this pass's owned files (it
 * would be a `WorkoutSessionRepository.ts`/`SqliteWorkoutSessionRepository.ts`
 * change, both explicitly read-only for Pass 3). `suggestNextProgression`
 * already degrades correctly for this ("no target rep range on the plan ->
 * derive one from the last session's rep count") - a real, documented
 * consequence of Pass 2's scope, not a silently dropped requirement.
 */
export function useProgressionSuggestion(
  { exerciseHistoryRepository, settings }: UseProgressionSuggestionDependencies,
  {
    exerciseId,
    primaryMuscleBodyPart,
    equipmentSlug,
    beforeSessionId,
  }: UseProgressionSuggestionInput,
): {
  previousPerformance: PreviousPerformance | null;
  suggestion: ProgressionSuggestion | null;
  isPending: boolean;
} {
  const previousQuery = usePreviousPerformance(
    exerciseHistoryRepository,
    exerciseId,
    beforeSessionId,
  );

  const incrementsQuery = useQuery({
    queryKey: ['settings', 'progression.increments'],
    queryFn: async () => ({
      upperIncrementKg: await settings.get('progression.upperIncrementKg'),
      lowerIncrementKg: await settings.get('progression.lowerIncrementKg'),
    }),
  });

  const suggestion = useMemo<ProgressionSuggestion | null>(() => {
    if (!exerciseId || !incrementsQuery.data || previousQuery.isPending) {
      return null;
    }
    const workingSets = (previousQuery.data?.sets ?? [])
      .filter((setEntry) => isRecordEligibleSetType(setEntry.setType))
      .flatMap((setEntry) =>
        setEntry.weightKg !== null && setEntry.reps !== null
          ? [{ weightKg: setEntry.weightKg, reps: setEntry.reps }]
          : [],
      );

    return suggestNextProgression({
      lastSessionWorkingSets: workingSets,
      targetRepRange: null,
      primaryMuscleBodyPart,
      equipmentSlug,
      increments: incrementsQuery.data,
    });
  }, [
    exerciseId,
    incrementsQuery.data,
    previousQuery.data,
    previousQuery.isPending,
    primaryMuscleBodyPart,
    equipmentSlug,
  ]);

  return {
    previousPerformance: previousQuery.data ?? null,
    suggestion,
    isPending: previousQuery.isPending || incrementsQuery.isPending,
  };
}
