# Real-device bug reports - round 3

## Problem summary

User tested the release APK on a real phone (not the emulator) and found
issues that never surfaced in dev-client/emulator testing - some of these are
release-build-specific or were always latent and only now hit with real data.

## The 4 items

1. **Tapping the grey Notes icon (or hardware-back exit sheet) during an
   active workout "bugs out the whole app."** ROOT CAUSE FOUND: Round 1's
   `BottomSheet.tsx` fix removed the `Modal` wrapper (previously escaped the
   layout tree into its own native window, so `position:absolute` full-screen
   offsets worked regardless of mount point). Every other sheet in the app
   was already migrated to the root-level `sheetStore`/`SheetHost` pattern
   specifically to avoid this (see `PlateCalculatorSheetContent.tsx`'s own
   comment citing the "Post-P12 bugfix pass"), but two call sites never were:
   `WorkoutHeader.tsx`'s notes sheet and `WorkoutExitActionSheet.tsx`
   (hardware-back exit choice), both rendered as a LOCAL inline `<BottomSheet>`
   nested inside `ActiveWorkoutScreen`'s own small header View, not through
   `SheetHost`. Without `Modal`, the sheet's `top:0/right:0/bottom:0/left:0`
   overlay now resolves relative to that small local parent instead of the
   real screen - a broken, half-off-screen overlay whose backdrop still
   captures touches, which reads as "the whole app is stuck." Fix: migrate
   both to `sheetStore.present()`, matching every other sheet in the app.
2. **Stats charts (Volume/Frequency/Session duration/Muscle group) don't
   render with real data; the new Body Weight card doesn't work either.**
   NOT YET ROOT-CAUSED - my own flex-collapse hypothesis (the `unitLabel`
   wrapper Views added in Round 2's `ChartCard.tsx` starving the chart of
   layout height) is disproven: `LineChartView`/`BarChartView` both set an
   explicit `height: 200` on their own root `View`, independent of parent
   flex. Needs fresh investigation with real logged data on a release-like
   build - candidates: an R8/minification-only failure (dev-client testing
   never exercises this), a Skia/Reanimated worklet issue specific to
   release optimizations, or a real logic bug in how `StatisticsScreen`
   wires real (non-empty) data into these cards that empty-state testing
   never exercised.
3. **Adding a progress photo doesn't work; no permission prompt appears at
   all.** `PhotoSourceSheetContent.tsx`'s own permission-request code looks
   correct in isolation (mirrors the already-proven `OnboardingScreen`
   pattern) and IS presented through `SheetHost` (not an inline `BottomSheet`
   like item 1) - so item 1's root cause likely doesn't explain this one.
   Needs fresh investigation: does the sheet even open on a real device, does
   tapping a row actually invoke `handlePick`, does the permission call
   itself silently fail.
4. **Redesign the active-workout set-row UI** to match a reference
   screenshot the user provided (numbered set badges "W"/"1"/"2"/pattern,
   a "Previous" read-only column, KG/Reps as separate editable fields,
   the rest-timer line with a warning icon, a per-exercise three-dot menu,
   "+ Add set" full-width button) - keep this app's existing dark palette
   and design tokens, this is a layout/structure change, not a reskin.

## Task shape and scaling

Items 1-3 are investigate-and-fix bug dispatches (item 1's root cause is
already found, just needs the fix applied and verified; items 2-3 need real
investigation first). Item 4 is a scoped UI redesign of one component
cluster. Four parallel dispatches, disjoint files.

## File ownership

- Dispatch A (item 1): `features/workout-logging/components/WorkoutHeader.tsx`,
  `features/workout-logging/components/WorkoutExitActionSheet.tsx`,
  `features/workout-logging/screens/ActiveWorkoutScreen.tsx` (wiring the
  sheetStore-based presentation in from the screen that owns the visibility
  state today).
- Dispatch B (item 2): `features/statistics/**` (investigation-first, fix
  whatever's found - likely `StatisticsScreen.tsx` and/or the individual
  chart card components and/or `components/charts/**`).
- Dispatch C (item 3): `features/body-metrics/components/PhotoSourceSheetContent.tsx`,
  `features/body-metrics/screens/PhotoGridScreen.tsx` (investigation-first).
- Dispatch D (item 4): `features/workout-logging/components/SetRow.tsx` and
  whatever sibling components it composes for the exercise card header
  (`SessionExerciseCard.tsx` or similar) - UI/layout only, no behavior change
  beyond what's needed to support the new layout.

No two dispatches share a file.

## Agent delegation plan

- frontend-agent Dispatch A (item 1): sheetStore migration fix.
- frontend-agent Dispatch B (item 2): Stats chart investigation and fix.
- frontend-agent Dispatch C (item 3): photo-permission investigation and fix.
- frontend-agent Dispatch D (item 4): set-row UI redesign.
- Orchestrator: code review, on-device verification (release build where
  feasible), regression gate, commit split by topic.

No new automated tests (standing user preference).
