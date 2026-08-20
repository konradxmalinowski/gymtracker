import { useEffect, useRef } from 'react';
import { router, Stack } from 'expo-router';

import { ExercisePickerScreen } from '@/features/exercise-library/screens/ExercisePickerScreen';
import { t } from '@/i18n';
import { useExercisePickerStore } from '@/stores/exercisePickerStore';

/**
 * Thin wrapper into `ExercisePickerScreen` (CLAUDE.md: "app/ never contains
 * screen bodies"). Imports the screen from its concrete path rather than
 * the `exercise-library` barrel - the same precedent every other `app/`
 * route wrapper already follows (e.g. `app/(tabs)/exercises/index.tsx`
 * imports `ExerciseLibraryScreen` directly, not through
 * `@/features/exercise-library`); `app/` wrappers are not "another feature"
 * for ARCHITECTURE.md section 3.1 rule 4's barrel-only requirement, that
 * rule governs cross-*feature* imports. Deliberately NOT re-exported from
 * the barrel: this screen's only real consumer is this one route wrapper -
 * `plans` never imports it directly, it only opens `exercisePickerStore`
 * and navigates here - and adding it to the barrel produces a genuine,
 * lint-failing `import/no-cycle` violation (`ExercisePickerScreen` ->
 * `useExerciseSearch` -> `useContainer`/`services/container.ts` ->
 * `features/plans` -> `PlanService.ts` -> back to the `exercise-library`
 * barrel for `EXERCISE_REST_SECONDS_MAX`) that a barrel export would close.
 *
 * The screen itself is prop-driven (`alreadySelectedIds`, `onConfirm`) -
 * since this route was reached via `router.push()`, not a function call,
 * those props are sourced from `exercisePickerStore`
 * (`stores/exercisePickerStore.ts`'s file header explains why a store,
 * rather than route params, is this flow's data-return mechanism) instead
 * of route params.
 */
export default function ExercisePicker() {
  const request = useExercisePickerStore((state) => state.request);
  const close = useExercisePickerStore((state) => state.close);

  // Defensive only, checked once at mount: this route is never navigated to
  // except immediately after `useExercisePickerStore.getState().open(...)`
  // (see `features/plans/screens/PlanDayEditorScreen.tsx`'s and
  // `features/workout-logging/components/AddExerciseButton.tsx`'s "Add
  // exercise" handlers), so `request` is always populated in the real app. A
  // `null` request at mount means this screen was reached some other way
  // (e.g. a stale deep link) - there is nothing useful to render, so it
  // backs out immediately rather than showing a broken picker.
  //
  // Deliberately gated on a ref rather than re-running on every `request`
  // change: `onConfirm` below calls `close()` (which nulls `request`) right
  // before its own `router.back()`. A dependency on `request` re-armed this
  // check on that same transition and fired a *second*, redundant
  // `router.back()` immediately after the legitimate one - harmless when
  // reached from `PlanDayEditorScreen` (nested under `(tabs)`, where a
  // second GO_BACK still finds a route to bubble to), but a genuine
  // `GO_BACK was not handled by any navigator` failure when reached from
  // `ActiveWorkoutScreen` (a root-level `(fullScreenModal)` route with
  // nothing further for a second pop to bubble to once the first has
  // already returned here). Running this once, at mount, preserves the
  // original stale-request defense without re-triggering on a state change
  // this screen's own confirm flow caused.
  const hasCheckedInitialRequestRef = useRef(false);
  useEffect(() => {
    if (hasCheckedInitialRequestRef.current) {
      return;
    }
    hasCheckedInitialRequestRef.current = true;
    if (!request && router.canGoBack()) {
      router.back();
    }
  }, [request]);

  if (!request) {
    return null;
  }

  return (
    <>
      <Stack.Screen options={{ title: t('exerciseLibrary.picker.title') }} />
      <ExercisePickerScreen
        alreadySelectedIds={request.alreadySelectedIds}
        onConfirm={(selectedIds) => {
          request.onConfirm(selectedIds);
          close();
          // Guarded the same way the mount effect above guards its own
          // `router.back()` - this route is always reached via a real
          // `router.push()` from its caller (see the mount effect's comment
          // above for the two known callers), so `canGoBack()` is expected
          // to be true here in practice; the guard is defense in depth, not
          // a silent no-op risk - `canGoBack()` reflects the whole
          // navigation tree (it bubbles through parent navigators, not just
          // this screen's own stack), so a `false` result means there is
          // genuinely nowhere to go back to, in which case an unguarded
          // `back()` would have failed identically.
          if (router.canGoBack()) {
            router.back();
          }
        }}
      />
    </>
  );
}
