# P5 - Workout plans - progress state

Last updated: 2026-08-06, after frontend-agent's follow-up accessibility fix round.

Current step: Step 6 (review)/Step 9 (security + accessibility) both run and
addressed; ready for Step 10 (docs) / Step 11 (commit).

## Per-agent status

| Agent | Scope | Status | Summary |
|---|---|---|---|
| database-agent | `features/plans/repository/*` | done | `PlanRepository`/`SqlitePlanRepository` built per the ARCHITECTURE.md contract plus `deletePlan`/`restorePlan`/`purgePlan` and (after a follow-up) `restoreDay`/`restoreDayExercise`. 35/35 tests pass. `duplicatePlan` name disambiguation intentionally left to PlanService. `purgePlan` is the hard delete that fires `ON DELETE SET NULL`/`CASCADE` for the session-snapshot behavior. |
| backend-agent-sonnet | `features/plans/services/*`, container wiring | done | `PlanService` built: Zod validation, delete routing (`deletePlan`->hard `purgePlan`, `deleteDay`/`removeExerciseFromDay`->soft delete + restore pass-throughs), duplicate-name disambiguation ("(copy)", "(copy 2)"...), `setSupersetGroup` minimum-2 rule (relaxed for single-id ungroup after a follow-up). `AppContainer` extended with `planRepository`/`planService`. `features/plans/index.ts` barrel now real. 64/64 service tests pass, full suite 573+ passing, typecheck/lint clean. |
| frontend-agent | screens/hooks/components/navigation, exercise-picker, DraggableList a11y fallback | done, then fixed | Initial pass reported done but an independent accessibility review (`reports/accessibility-2026-08-06-p5.md`, A11Y-P5-001, BLOCKING) found the move-up/move-down mechanism never reached a native node through any of the three real screens - `PressScale`/`PlanCard`/`PlanDayCard`/`PlanDayExerciseRow` silently dropped the cloned accessibility props, and `SupersetGroupEditor` would have been a fourth drop point. Fixed in a follow-up round (see "Accessibility fix round" below); re-verified with integration tests against the real components, not just a synthetic `<Text>`. security-agent-sonnet's independent review (`reports/security-2026-08-06-p5.md`) found zero CRITICAL/HIGH/MEDIUM issues (one LOW, non-blocking, optional). |
| general-purpose (accessibility auditor) | independent re-verification | done | Found A11Y-P5-001 (blocking), A11Y-P5-002 (handle-nesting, report-only/device-unverified), A11Y-P5-003 (test coverage gap), fixed A11Y-P5-004 directly (VoiceOver announcement for multi-select count), confirmed A11Y-P5-005/006 pass/informational. Full report: `reports/accessibility-2026-08-06-p5.md`. |
| security-agent-sonnet | independent review | done | Zero blocking findings. Full report: `reports/security-2026-08-06-p5.md`. |

## Files changed so far

Infrastructure/application (database-agent, backend-agent-sonnet):
- `features/plans/repository/PlanRepository.ts`, `SqlitePlanRepository.ts`, `errors.ts` (new)
- `__tests__/features/plans/repository/SqlitePlanRepository.test.ts` (new, 35 tests)
- `features/plans/services/PlanService.ts`, `errors.ts` (new)
- `features/plans/index.ts` (now a real barrel, was empty skeleton)
- `services/container.ts` (extended: `planRepository`/`planService`)
- `__tests__/features/plans/services/PlanService.test.ts` (new, 64 tests)
- `__tests__/services/container.test.tsx` (extended)

Presentation (frontend-agent):
- `components/gestures/DraggableList.tsx` - move-up/move-down `accessibilityActions`
  fallback (the mandatory carry-over gate), extending `__tests__/components/gestures/DraggableList.test.tsx`
- `features/plans/domain/formatDayExerciseTarget.ts` (new, pure formatter + tests)
- `features/plans/hooks/{queryKeys,invalidation,usePlans,usePlan,usePlanMutations,useReorderPlans,useDayMutations,useReorderDays,useDayExerciseMutations,useReorderDayExercises}.ts` (new)
- `features/plans/components/{PlanCard,PlanDayCard,PlanDayExerciseRow,PlanEditorHeader,SupersetGroupEditor}.tsx` (new)
- `features/plans/screens/{PlanListScreen,PlanDetailScreen,PlanDayEditorScreen}.tsx` (new)
- `features/exercise-library/screens/ExercisePickerScreen.tsx` (new, additive)
- `stores/exercisePickerStore.ts` (new) - the modal-picker data-return mechanism
- `app/(tabs)/plans/_layout.tsx`, `[planId].tsx`, `[planId]/day/[dayId].tsx` (new); `index.tsx` rewritten as a thin wrapper
- `app/(tabs)/_layout.tsx` (one-line registration change: `plans/index` -> `plans`)
- `app/(modals)/_layout.tsx`, `app/(modals)/exercise-picker.tsx` (new - first modal route group)
- `navigation/routes.ts` (added `routes.plans.*`, `routes.modals.exercisePicker`)
- `i18n/catalogs/en.ts` (removed `comingSoon.plansTitle`/`plansMessage`; added `plans.*`, `exerciseLibrary.picker.*`, `draggableList.moveUp/DownAccessibilityLabel`)
- New test files: `__tests__/features/plans/domain/formatDayExerciseTarget.test.ts`,
  `__tests__/features/plans/hooks/useReorderPlans.test.tsx`,
  `__tests__/features/plans/screens/{PlanListScreen,PlanDetailScreen,PlanDayEditorScreen}.test.tsx`,
  `__tests__/features/plans/components/PlanCard.test.tsx`,
  `__tests__/features/exercise-library/screens/ExercisePickerScreen.test.tsx`

## Accessibility fix round (post-review)

Fixed, in order, per the accessibility review's A11Y-P5-001 finding:

1. `components/gestures/PressScale.tsx` - added `accessible`/`accessibilityActions`/
   `onAccessibilityAction` to `PressScaleProps` and forwarded them to the underlying
   `Pressable`. Previously had none of the three; every caller built on it
   (`Button`, `IconButton`, `Card`, `Chip`, `ListRow`, every feature row) was an
   unreachable dead end for cloned-on accessibility actions.
2. `features/plans/components/{PlanCard,PlanDayCard,PlanDayExerciseRow}.tsx` - each
   now accepts the same three props and forwards them to its root `PressScale`.
3. `features/plans/components/SupersetGroupEditor.tsx` - now accepts the same three
   props and clones them onto its wrapped child (the grouped `PlanDayExerciseRow`),
   not its own outer `View` - the third drop point the review named.
4. `components/gestures/DraggableList.tsx` - restructured so the move-up/move-down
   actions attach to the drag handle itself in `dragHandle="handle"` mode (all
   three real screens use this mode), not to the whole row - avoids piling a
   second accessible-collapse concern onto the row on top of the pre-existing one
   the review's A11Y-P5-002 finding flagged (see the new "Known gaps" entry in
   CLAUDE.md - A11Y-P5-002 is NOT resolved by this, it's a separate, still-open,
   device-unverified concern about the row's own pre-existing
   `accessibilityRole`/`accessibilityLabel` already making it one accessible unit,
   independent of anything this fix touches).
5. New integration tests added (the regression class the original unit tests
   missed, per A11Y-P5-003): `__tests__/features/plans/components/{PlanCard,
   PlanDayCard,PlanDayExerciseRow}.test.tsx` each mount `DraggableList` with the
   *real* row component and assert `accessibilityActions` reaches a native node,
   in both `dragHandle="row"` and `dragHandle="handle"` modes. Sanity-checked by
   temporarily reverting the `PressScale` fix and confirming the row-mode test
   fails as expected, then restoring it. Real-screen-level assertions also added
   to `PlanListScreen.test.tsx`/`PlanDetailScreen.test.tsx`/
   `PlanDayEditorScreen.test.tsx`.
6. CLAUDE.md's "Known gaps" section updated: the original DraggableList gap
   marked Resolved (with the full fix chain documented), and a new gap entry
   added for A11Y-P5-002 (device-unverified, structural fix would need to change
   how far each row's `accessible` container extends - not attempted without a
   device).

Not addressed (out of scope for this fix round, per the coordinator's message):
A11Y-P5-006 (low priority, informational, move-action labels have no
row-position context) and security-agent-sonnet's optional SEC-001 (multi-add
transaction atomicity) - both are explicitly optional/non-blocking in their own
reports.

Re-verified after the fix: `tsc --noEmit` clean, `eslint .` clean (0 errors, same
pre-existing `no-require-imports` warning pattern), full suite 70 suites/616
passed/1 pre-existing skip, `npx expo export --platform ios` bundles successfully.

## Deviations from the plan (both justified, both load-bearing)

1. **`ExercisePickerScreen` is NOT exported from `features/exercise-library/index.ts`**,
   contrary to this plan's "Affected layers" line. Reason: the chosen modal
   data-return mechanism is `stores/exercisePickerStore.ts`, not props threaded
   through a barrel-exported component - `plans` never actually imports
   `ExercisePickerScreen` (it only opens the store and navigates to the
   `(modals)/exercise-picker` route). Adding the barrel export anyway produced a
   real `import/no-cycle` ESLint failure: `ExercisePickerScreen` ->
   `useExerciseSearch` -> `useContainer`/`services/container.ts` ->
   `features/plans` -> `PlanService.ts` -> back to the `exercise-library` barrel
   (for `EXERCISE_REST_SECONDS_MAX`). `app/(modals)/exercise-picker.tsx` imports
   the screen from its concrete path instead, mirroring the precedent every other
   `app/` route wrapper already follows (e.g. `app/(tabs)/exercises/index.tsx`
   importing `ExerciseLibraryScreen` directly). `exercise-library` stays a leaf
   either way.
2. **Modal data-return mechanism**: a new root-level Zustand store
   (`stores/exercisePickerStore.ts`), not route params - the selection is an
   unbounded list of exercise ids, and Expo Router has no "push and await a
   result" primitive. Lives at the project root (like `sheetStore`/`toastStore`)
   rather than inside either feature, since both `exercise-library` (the picker
   screen) and `plans` (the day editor) need to touch it without creating a
   cross-feature dependency either direction.

## Notes

- Branch `feat/p5-workout-plans` created off `main` (which now includes merged PR
  #5 / P4).
- Repo description/topics applied to GitHub (Step 2c) with user approval.
- Step 0 clarifications: superset UX (multi-select + Group action), no Start
  Workout stub this phase, snapshot test done via raw-inserted session row, no
  simulator/device available (expo export proxy again).
- Full plan: `plans/2026-08-06-p5-workout-plans.md`.

Next: Step 6 code review / Step 9 security + accessibility check / Step 10 docs
update / Step 11 commit, per the orchestrator's own sequencing.
