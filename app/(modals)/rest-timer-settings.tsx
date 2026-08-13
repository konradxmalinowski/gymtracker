import { useEffect } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';

import { RestTimerSettingsSheet } from '@/features/rest-timer';
import { useSetRestTimerPreset } from '@/features/workout-logging/hooks/useRestTimer';
import { t } from '@/i18n';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';

/**
 * Thin wrapper into `RestTimerSettingsSheet` (CLAUDE.md: "app/ never
 * contains screen bodies"), the second `(modals)` route after P5's
 * `exercise-picker.tsx` and built on the same conventions: imports the
 * screen content from its concrete path (not a barrel re-export for the
 * `workout-logging` hook - `app/` wrappers are not "another feature" for
 * ARCHITECTURE.md section 3.1 rule 4's barrel-only requirement, exactly the
 * precedent `exercise-picker.tsx`'s own file header already documents),
 * `sessionExerciseId` as a plain route param rather than a store (unlike the
 * picker's unbounded id-list result, this flow's "result" is a single
 * primitive value with a cheap, ordinary round trip through the route).
 */
export default function RestTimerSettings() {
  const { sessionExerciseId } = useLocalSearchParams<{ sessionExerciseId: string }>();
  const setPreset = useSetRestTimerPreset();

  const exercise = useActiveWorkoutStore((state) =>
    state.session?.exercises.find((candidate) => candidate.id === sessionExerciseId),
  );

  // Defensive only, mirroring `exercise-picker.tsx`'s own "reached some
  // other way than the real in-app flow" guard - there is nothing useful to
  // show without a resolvable exercise. Runs in an effect, not inline during
  // render, for the same reason `exercise-picker.tsx` does it there: router
  // navigation is a side effect.
  useEffect(() => {
    if ((!sessionExerciseId || !exercise) && router.canGoBack()) {
      router.back();
    }
  }, [sessionExerciseId, exercise]);

  if (!sessionExerciseId || !exercise) {
    return null;
  }

  return (
    <>
      <Stack.Screen options={{ title: t('restTimer.settingsSheet.title') }} />
      <RestTimerSettingsSheet
        currentSeconds={exercise.restSecondsOverride}
        onSelectPreset={(seconds) => {
          setPreset(sessionExerciseId, seconds);
          router.back();
        }}
        testID="rest-timer-settings-sheet"
      />
    </>
  );
}
