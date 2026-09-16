# UI/UX polish and bug sweep

## Problem summary

Live user testing on the emulator (post P15 + known-gaps sweep) surfaced 8 UI/UX
issues, reported in one rapid-fire batch. Investigated live (screenshots) and in
code before planning; findings below distinguish confirmed root causes from
still-open questions.

## The 8 items, confirmed root causes, and owners

1. **Home screen / Quick Start button "looks ugly."** Subjective design feedback,
   no bug. Design polish pass: visual hierarchy, spacing, button treatment.
   frontend-agent, Dispatch A.
2. **"Active plan" card layout** - user wants plan name on the left, action
   button on the right (a row layout), per standard UI/UX card conventions,
   replacing the current stacked-vertical layout. frontend-agent, Dispatch A.
3a. **"Goals" missing from bottom tab navigation.** Confirmed in code:
   `app/(tabs)/_layout.tsx` registers exactly 5 tabs (index/plans/exercises/
   stats/profile) - no daily-goals tab. Daily goals is currently reachable only
   through some other path (Home's TodaysGoalsCard, most likely). Needs a
   decision: add as a 6th tab (routing/layout change) - frontend-agent,
   Dispatch B (isolated: touches the shared tab layout, which items 1/2 don't).
3b. **Bottom-tab "active" indicator misaligned** - a white bar was observed
   stuck under the "Exercises" tab regardless of which tab was actually
   selected (Home, then Plans, both showed the icon/label correctly highlighted
   but the bar never moved). No custom indicator code was found anywhere in
   the app (`grep` for indicator/TabIndicator styling came back empty), which
   means this is either a genuine React Navigation/expo-router bottom-tabs
   rendering bug, or - live testing used `adb shell input tap` synthetic
   touches, which can leave an Android accessibility-focus ring behind that
   doesn't reflect real user touch - an artifact, not a real bug. Dispatch B
   re-verifies with fresh eyes before treating this as confirmed; do not
   "fix" a possible non-issue speculatively.
4. **Set-type picker expands the whole row downward** when selecting a set's
   type during an active workout, pushing all following content down - jarring.
   Confirmed in code: `SetRow.tsx`'s expanded section renders an inline
   `Row wrap` of `Chip`s for `PICKABLE_SET_TYPES`, reflowing the list. Fix:
   move set-type selection into an overlay (a small popover/dropdown or the
   existing `BottomSheet`/action-sheet pattern) that doesn't reflow surrounding
   rows. frontend-agent, Dispatch C (workout-logging, isolated file set).
5. **Reminder time-of-day setting reported "missing."** Code shows it DOES
   exist in `ReminderFormSheetContent.tsx` (hour/minute `StepperField`s, shown
   when `reminderType === 'scheduled'`, which is the default). Needs live
   investigation to find the actual gap - possibly a different entry point
   (e.g. a reminder linked from `GoalFormScreen` when enabling reminders
   inline on a goal) that doesn't expose time selection, or the existing
   control is present but not discoverable/visible enough. Dispatch C
   investigates and fixes what's actually missing, not what's already there.
6. **Avatar picker on first-run onboarding doesn't apply the selected photo.**
   CONFIRMED by live reproduction: picker opens, crop UI completes, but the
   avatar circle still shows initials afterward - the crop result never reaches
   profile state. Root cause not yet isolated (needs investigation: the
   `expo-image-picker`/`expo-image-manipulator` result URI not being threaded
   into the onboarding form's local state, or the mutation not firing/awaiting
   correctly, or an async race with the crop callback). frontend-agent,
   Dispatch D (onboarding, isolated).
7. **Statistics charts have no axis/unit labels** (no visible time axis, no
   unit for the measured progress, no frequency label). CONFIRMED in code:
   `VolumeChartCard`/`FrequencyChartCard`/`ExerciseProgressionCard` all pass
   `formatY={(value) => \`${Math.round(value)}\`}` with no unit suffix (kg,
   reps, sessions, etc.), and none pass `formatX` at all (`components/charts`'
   `BarChartView`/`LineChartView` both support it, just unused) - so there is
   no time-axis formatting either. Fix: add unit-suffixed `formatY` per chart's
   actual metric and a real `formatX` (date/period formatting) to all three
   (check every other chart card in `features/statistics/components/` for the
   same gap, not just these three). frontend-agent, Dispatch E (statistics,
   isolated).
8. **Exercise filter sheet can't be scrolled down.** ROOT CAUSE FOUND:
   `components/feedback/BottomSheet.tsx` wraps its entire `children` in one
   `GestureDetector` running `Gesture.Pan()` (the sheet's drag-to-dismiss
   gesture), with no coordination (`.simultaneousWithExternalGesture()` /
   `.blocksExternalGesture()` / a native-scroll-aware `Gesture.Native()`
   composition) against any inner `ScrollView` a sheet's content renders
   (`ExerciseFilterSheetContent.tsx` has a correctly-flexed `ScrollView`, so
   the content-side layout is not the bug). The outer pan gesture likely wins
   every vertical drag, starving the inner ScrollView of scroll gestures. This
   is a SHARED component bug - fixing it in `BottomSheet.tsx` fixes every
   sheet with scrollable content, not just the exercise filter.
   frontend-agent, Dispatch F (shared component - runs FIRST/isolated since
   `ReminderFormSheetContent`/`ExerciseFilterSheetContent`/others all depend
   on it; sequence before or parallel-but-reviewed-first relative to any
   dispatch that also touches sheet content).

## Task shape and scaling

Single application, multiple independent-file-set dispatches (6 parallel where
files don't overlap), one shared-component fix (Dispatch F) that other sheet
content depends on but doesn't conflict with at the file level. Platform:
React Native/Expo, Android-verified on the `gymtracker_test` emulator.

## File ownership (disjoint-set check)

- Dispatch A (items 1-2): `app/(tabs)/index.tsx` or wherever Home's screen
  body lives (`features/home/screens/HomeScreen.tsx` most likely) and the
  ActivePlanCard component (`features/home/components/ActivePlanCard.tsx`).
- Dispatch B (items 3a-3b): `app/(tabs)/_layout.tsx` and whatever navigation
  change item 3a needs (possibly `navigation/routes.ts`).
- Dispatch C (items 4-5): `features/workout-logging/components/SetRow.tsx`
  and whatever new overlay component it needs; `features/daily-goals/
components/ReminderFormSheetContent.tsx` and/or `GoalFormScreen.tsx`
  depending on where item 5's actual gap turns out to be.
- Dispatch D (item 6): `features/onboarding/**`.
- Dispatch E (item 7): `features/statistics/components/*.tsx`.
- Dispatch F (item 8): `components/feedback/BottomSheet.tsx` only.

Dispatch F touches a file none of the others touch, but its fix affects
runtime behavior other dispatches' sheets rely on - sequence F to land and be
reviewed before final integration testing of C/E's sheet-adjacent work, not
necessarily before those dispatches START (they can still write their own
code in parallel; only the end-to-end verification of scrolling behavior
needs F merged first).

## Step-by-step sequence

1. Dispatch A, B, C, D, E, F in parallel (writing code; F's integration
   verification waits for F itself to finish, per above).
2. Orchestrator: code review each diff (Step 6), particularly Dispatch F's
   gesture-coordination fix (Gesture Handler API correctness) and Dispatch D's
   avatar fix (async correctness).
3. On-device verification (Step 7) on the `gymtracker_test` emulator: re-test
   every one of the 8 original repro steps live.
4. Full Jest suite as regression gate (Step 8) - no new tests per standing
   preference, fix only if this sweep breaks something existing.
5. Accessibility re-check (Step 9e) on touched screens - reuse the established
   code-level-audit pattern.
6. Commit split by dispatch/topic, PR, done.

## Edge cases to address

- Item 4's new overlay set-type picker must still be reachable/operable via
  screen reader (the inline Chip row currently is - don't regress that).
- Item 8's gesture fix must not break the sheet's own drag-to-dismiss - only
  add coordination with inner scrollables, not remove the pan gesture.
- Item 7's `formatX`/unit `formatY` must handle empty-data and single-point
  chart states without crashing (check `summarizeSeries`'s empty-array path).
- Item 6's avatar fix must handle the "user cancels the picker" and
  "permission denied" paths without regressing (both already presumably
  handled - verify, don't just add the happy path).

## Feature-flag decision

Not applicable - project has no feature-flag system.

## Agent delegation plan

- frontend-agent Dispatch A (items 1-2): Home + ActivePlanCard design polish.
- frontend-agent Dispatch B (items 3a-3b): tab nav - add Goals tab, verify/fix
  or rule out the indicator issue.
- frontend-agent Dispatch C (items 4-5): set-type overlay picker, reminder-time
  gap investigation and fix.
- frontend-agent Dispatch D (item 6): onboarding avatar picker fix.
- frontend-agent Dispatch E (item 7): statistics chart axis/unit labels.
- frontend-agent Dispatch F (item 8): BottomSheet gesture-vs-scroll fix.
- Orchestrator: code review, on-device verification, regression gate.
- general-purpose (a11y stand-in): post-fix accessibility re-check.
- docs-agent: CLAUDE.md update if any of these fixes close a real Known-gaps-
  worthy item or introduce a durable pattern worth documenting (e.g. the
  BottomSheet gesture-coordination fix, since it's a shared-component
  correctness fix future sheet content should be able to rely on).
- git-commit-agent: final commit(s), split by dispatch/topic.

No database-agent, no backend-agent, no test-agent dispatch for new tests
(standing user instruction) - this is a presentation-layer-only sweep.
