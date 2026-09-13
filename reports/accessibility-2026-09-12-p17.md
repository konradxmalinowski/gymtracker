# Accessibility Audit Report

**Date**: 2026-09-12
**Scope**: P17 ("Daily goals and reminders") UI layer on `feat/p17-daily-goals-reminders` -
`features/daily-goals/screens/{DailyGoalsScreen,GoalFormScreen,GoalListScreen,
GoalProgressEntryScreen,ReminderListScreen,ReminderStatsScreen}.tsx`,
`features/daily-goals/components/{GoalCard,ReminderFormSheetContent,ReminderRow,
TodayGoalRow,WeekdayPicker,goalIcons}.tsx`, `app/goals/**`,
`app/(modals)/goal-progress-entry.tsx`, and `features/home/components/
TodaysGoalsCard.tsx` plus its integration into `features/home/screens/HomeScreen.tsx`.
Domain/repository/service/migration files (`features/daily-goals/domain/**`,
`repository/**`, `services/**`, `database/migrations/003_daily_goals.ts`) are out of
this review's scope - a separate backend-slice pass (`plans/
2026-09-12-p17-daily-goals-backend.md`) already covered that layer and this review
does not re-touch it. Run by a general-purpose agent standing in for the
accessibility-agent role, the same substitution `reports/accessibility-2026-08-11-p7.md`
through `reports/accessibility-2026-08-19-p12.md` used, per CLAUDE.md and this task's
own instructions.

**Method**: read `reports/accessibility-2026-08-19-p12.md` in full first, as the
explicit format/rigor template for this report. Read every file in scope in full,
plus the shared primitives they compose (`PressScale`, `Card`, `Chip`, `Switch`,
`Checkbox`, `StepperField`, `StatTile`, `ErrorState`, `EmptyState`, `IconButton`,
`DraggableList`, `Text`), and the two closest structural precedents named in this
feature's own doc comments - `PlanCard`/`PlanListScreen` (P5's `DraggableList`
"handle" mode precedent) and `LastWorkoutCard`/`StreakCard` (Home's single-accessible-
node summary-card shape) - to confirm P17 actually followed them rather than assuming
from the doc comment alone. `grep -rn "SwipeableRow" features/daily-goals app/goals
"app/(modals)/goal-progress-entry.tsx" features/home/components/TodaysGoalsCard.tsx`
run first, confirming zero matches (exit code 1) before anything else.

Every claim that static reading alone could not settle was checked with a real RNTL
mount (`@testing-library/react-native` v14 - `render()` must be `await`ed or the
returned `toJSON`/`findByText` are `undefined`, the same v14 trap
`reports/accessibility-2026-08-19-p12.md` already flagged), written as a throwaway
scratch file (`scratch-a11y-p17.test.tsx`, at the repo root, deleted once its findings
were captured - no new file was left under `__tests__/`, and this pass authored no
permanent test, per this project's own current "no new tests this pass" policy for
in-flight work and this task's explicit instruction). Checked empirically, not
assumed:

1. `DraggableList` (`dragHandle="handle"`) + real `GoalCard` rows (two goals) - a
   `toJSON()` dump confirmed each row's own drag-handle `Animated.View` independently
   carries its own `moveUp`/`moveDown` `accessibilityActions` (first row: `moveDown`
   only; second/last row: `moveUp` only - correct boundary behavior), and that each
   row's `Switch` ("Disable Drink water" / "Disable Read") and delete `IconButton`
   ("Delete Drink water" / "Delete Read") remain independently reachable, distinct
   nodes - not swallowed by the row's own outer accessible `PressScale`.
2. `ReminderRow` - a `toJSON()` dump confirmed three independently-labeled
   `accessibilityRole: "button"` nodes ("Evening reminder" / "View stats for Evening
   reminder" / "Delete Evening reminder"), with the row's `Switch` reachable
   alongside them - no compound-node collapse.
3. `TodayGoalRow` (counter type) - confirmed the increment/decrement controls render
   as "Subtract one from Push-ups" / "Add one to Push-ups," not "Increment"/
   "Decrement" alone.
4. `TodaysGoalsCard` - confirmed exactly one `accessibilityRole: "button"` node in the
   rendered tree, carrying a single computed label ("Today's goals, No goals
   scheduled today" in the empty-active case tested).
5. `ReminderFormSheetContent`'s hour/minute `StepperField` pair, rendered with the
   exact props the real component passes - **pre-fix**, this reproduced the real bug
   below (both fields' Increase/Decrease buttons announced the identical string,
   "Increase Reminder time" / "Decrease Reminder time," for both hour and minute).
   **Post-fix**, re-ran the same mount and confirmed the two Increase labels are now
   distinct ("Increase Reminder hour" / "Increase Reminder minute").

`npx tsc --noEmit`, `npx eslint features/daily-goals i18n/catalogs/en.ts`, the full
`__tests__/features/daily-goals/**` suite (7 suites, 79 tests), and the full repo-wide
Jest suite (154 suites, 1439 passed, 1 pre-existing skip, 1440 total) were all
independently re-run after the fix below to confirm nothing regressed.

## Summary

Total: 1 - **Blocking: 0** | High: 0 | Medium: 1 | Low/Informational: 0

**Verdict: no BLOCKING finding.** P17 does not introduce the `SwipeableRow`-collapse
bug class that blocked P7/P8 and was re-confirmed absent in P9-P12:
`grep -rn "SwipeableRow" features/daily-goals app/goals "app/(modals)/
goal-progress-entry.tsx" features/home/components/TodaysGoalsCard.tsx` returns zero
matches (exit code 1) - the primitive is never imported anywhere in this feature, and
no reordering UI in this feature uses it either (`GoalListScreen` reuses
`DraggableList`, not `SwipeableRow`, for goal reordering).

One real, non-blocking finding was found and fixed within this pass (the same "fix
non-blocking findings same-phase" precedent P8-P12's own reports established),
verified with a real before/after RNTL mount: `ReminderFormSheetContent`'s hour/minute
time-of-day `StepperField` pair shared one identical `accessibilityLabel`, making
their Increase/Decrease buttons indistinguishable to a screen-reader user (MEDIUM).

---

## Findings

### [A11Y-P17-001] `ReminderFormSheetContent`'s hour/minute `StepperField` pair shared one identical `accessibilityLabel`, making Increase/Decrease indistinguishable - MEDIUM, FIXED

**Category**: Perceivable / info and relationships, Operable / name-role-value
(WCAG 1.3.1 / 4.1.2) - two independently-operable controls with no distinguishing
non-visual label, the exact disambiguation-discipline gap this task's own brief named
(the class `CalendarDaySessionPicker`'s LOW/informational P12 finding flagged as
*missing*, and the class `TodayGoalRow`'s counter increment/decrement and every
`GoalCard`/`ReminderRow` trailing control in this same feature get right elsewhere).

**Location**: `features/daily-goals/components/ReminderFormSheetContent.tsx` (pre-fix
lines ~186-206): the "Time" section renders two `StepperField`s side by side - one for
the hour (0-23), one for the minute (0-55, step 5) - and both passed the exact same
prop: `accessibilityLabel={t('dailyGoals.reminderForm.timeAccessibilityLabel')}`
("Reminder time"). `components/ui/StepperField.tsx` builds its own Increase/Decrease
button labels as `t('common.increase') + ' ' + accessibilityLabel` /
`t('common.decrease') + ' ' + accessibilityLabel` (confirmed by reading its source,
lines ~97-108) - with an identical base label, this produced four buttons in the same
form, two pairs, all reading as "Increase Reminder time" / "Decrease Reminder time,"
with nothing to tell a VoiceOver/TalkBack user which pair adjusts the hour and which
adjusts the minute. A sighted user disambiguates the pair by its left-to-right visual
position relative to the `:` separator between them; a screen-reader user gets no
equivalent cue, since focus order alone does not reliably convey "this one is the
hour" without re-deriving it from context on every visit to the form.

This is the identical bug shape flagged in item 4 of this review's own brief (an
increment control "must announce which goal it belongs to, not just 'increment'") and
the exact severity class `reports/accessibility-2026-08-19-p12.md`'s
`CalendarDaySessionPicker` LOW/informational note already established this codebase
should not repeat: two adjacent, identically-labeled interactive controls with no way
to tell them apart. It is also a pre-existing, parallel pattern in this codebase's
Gravitus-refresh-era `features/profile/screens/RemindersSettingsScreen.tsx` (its own
hour/minute `StepperField` pair share `t('remindersSettings.timeAccessibilityLabel')`
identically, confirmed by reading that file) - out of this review's scope (it is not
part of the P17 "Daily goals and reminders" UI surface named above), so it is flagged
here for the orchestrator's awareness only and left unfixed, matching this codebase's
own established precedent for out-of-scope pre-existing issues (e.g.
`reports/accessibility-2026-08-19-p12.md`'s own "flagged for the orchestrator only"
treatment of the `generateMonthGrid` domain bug it found but was not permitted to
touch).

**Empirical proof** (not just static reading): a real RNTL mount of the exact two
`StepperField` instances with the production props (`accessibilityLabel` from
`dailyGoals.reminderForm.timeAccessibilityLabel` on both) produced, via `toJSON()`,
four Increase/Decrease buttons whose text was `["Decrease Reminder time", "Increase
Reminder time", "Decrease Reminder time", "Increase Reminder time"]` - literally
identical strings for both fields, not merely visually similar.

**Fix applied**:

- `i18n/catalogs/en.ts`: replaced the single `dailyGoals.reminderForm
.timeAccessibilityLabel` key ("Reminder time") with two distinct keys -
  `timeHourAccessibilityLabel` ("Reminder hour") and `timeMinuteAccessibilityLabel`
  ("Reminder minute") - confirmed via `grep -rln
"reminderForm.timeAccessibilityLabel"` that the removed key had exactly one other
  call site (the file fixed below) before the edit, so nothing else was left
  referencing a now-deleted key.
- `features/daily-goals/components/ReminderFormSheetContent.tsx`: the hour
  `StepperField` now passes `t('dailyGoals.reminderForm.timeHourAccessibilityLabel')`
  and the minute `StepperField` now passes
  `t('dailyGoals.reminderForm.timeMinuteAccessibilityLabel')`, in place of the one
  shared key both previously used.

**Verification**: re-ran the same RNTL mount after the fix - the four
Increase/Decrease buttons now read `["Decrease Reminder hour", "Increase Reminder
hour", "Decrease Reminder minute", "Increase Reminder minute"]`, all four distinct.
`npx tsc --noEmit` clean; `npx eslint features/daily-goals i18n/catalogs/en.ts` clean;
the full `__tests__/features/daily-goals/**` suite (7 suites, 79 tests) and the full
repo-wide Jest suite (154 suites, 1439 passed, 1 pre-existing skip, 1440 total) both
pass with no new failures.

---

## Confirmed correct (checked explicitly, no defect found)

- **No `SwipeableRow`-collapse instance anywhere in this phase's scope.**
  `grep -rn "SwipeableRow" features/daily-goals app/goals "app/(modals)/
goal-progress-entry.tsx" features/home/components/TodaysGoalsCard.tsx` returns zero
  matches (confirmed by exit code, not just eyeballing empty output). `GoalListScreen`
  reorders goals via `DraggableList`, not `SwipeableRow`; nothing in this feature
  implements swipe-to-delete.
- **`GoalListScreen`'s `DraggableList` (`dragHandle="handle"`) + `GoalCard` correctly
  reuses P5's already-audited move-up/move-down accessibility mechanism, verified
  empirically, not assumed from the doc comment's claim of mirroring `PlanCard`.**
  `GoalCard.tsx` declares and forwards `accessible`/`accessibilityActions`/
  `onAccessibilityAction` onto its root `PressScale` exactly like `PlanCard.tsx` does
  - but in `dragHandle="handle"` mode, `DraggableList.tsx`'s own `attachMoveActions`
  path is never invoked on `content` at all (`accessibleContent = dragHandle ===
'handle' ? content : attachMoveActions(...)`, `components/gestures/
DraggableList.tsx` lines ~359-360): the move actions are instead attached directly to
  the drag-handle glyph's own `Animated.View` (lines ~308-334), independent of
  whatever `GoalCard` does with those forwarded props. This means `GoalCard`'s own
  `accessible`/`accessibilityActions` props are, in this mode, dead pass-through
  capacity reserved for a future `dragHandle="row"` usage - not a gap, since
  `PlanListScreen`'s own `renderItem` (confirmed by reading it) likewise never passes
  those three props into `PlanCard` in handle mode either. A real RNTL `toJSON()` dump
  of `DraggableList` + two real `GoalCard` rows confirmed the actual, load-bearing
  mechanism works: each row's own handle carries its own correct `moveUp`/`moveDown`
  pair (first row `moveDown` only, last row `moveUp` only), and the row's `Switch`
  ("Disable Drink water") and delete button ("Delete Drink water") remain
  independently reachable, distinct nodes alongside it - not collapsed by the row's
  outer `accessible` `PressScale`. This is the identical, already-verified-safe shape
  CLAUDE.md's "Known gaps" section documents for `PlanCard`/`PlanDayCard`/
  `PlanDayExerciseRow` (P15's on-device `uiautomator dump` finding that Android's
  `accessible={true}` does not collapse nested focusable descendants the way iOS's
  model would) - `GoalCard` inherits that same confirmed-safe structure verbatim.
- **`ReminderRow` (not `DraggableList`-backed - reminders don't reorder, per this
  feature's own scope) correctly exposes three independent, distinctly-labeled
  controls with no compound-node collapse**, verified via a real RNTL `toJSON()` dump:
  the row itself ("Evening reminder"), "View stats for Evening reminder," and "Delete
  Evening reminder" all render as separate `accessibilityRole: "button"` nodes, with
  the enable/disable `Switch` reachable alongside them. `PressScale` (the primitive
  every row in this feature is built on) forwards accessibility props straight onto a
  real native `Pressable` with no `cloneElement`-based merging of its own (confirmed
  by reading its source) - the mechanism that caused the P7/P8 `SwipeableRow` bug does
  not exist in this primitive at all, and this feature never wraps a compound child in
  an `accessible` ancestor the way that bug required.
- **Every quick-action control on `DailyGoalsScreen`'s `TodayGoalRow` is
  disambiguated by the owning goal's name, not a bare verb.** Verified both by
  reading the source (every `accessibilityLabel` on the boolean checkbox, the counter
  increment/decrement pair, and the numeric "Add" control is built from a
  `{{name}}`-templated i18n string) and empirically (a real RNTL mount of a counter
  goal named "Push-ups" rendered "Subtract one from Push-ups" / "Add one to Push-ups,"
  not "Decrement"/"Increment" alone) - the exact discipline this review's own brief
  named `CalendarDaySessionPicker`'s P12 finding as an example of *missing*; P17 gets
  it right everywhere else in this feature except the one fixed finding above.
- **`GoalCard`/`ReminderRow`'s enable/disable `Switch` and delete controls are
  likewise name-disambiguated**, e.g. `"Disable Drink water"` / `"Enable Drink
water"`, `"Delete Drink water"`, `"Delete Evening reminder"` - confirmed both by
  source (every label is a `{{name}}`-templated key) and by the same RNTL dumps
  above.
- **`TodaysGoalsCard` correctly follows the single-accessible-node summary-card shape
  `LastWorkoutCard`/`StreakCard` already establish, not a compound multi-control
  node** - confirmed by reading `LastWorkoutCard.tsx`'s equivalent shape first, then
  verifying `TodaysGoalsCard` matches it: `Card` is given `onPress` + one computed
  `accessibilityLabel` (combining the card's title with its resolved state - the
  progress template when goals are active today, or one of the two real empty-state
  messages otherwise) and no other element inside it carries its own accessibility
  role or label. `Card.tsx`'s own source confirms *why* this is safe: when `onPress`
  is provided, the whole card becomes one `PressScale`-driven `button`-role control;
  the plain `Text`/`Row`/`Column` children inside carry no accessibility props of
  their own to conflict with it. A real RNTL `toJSON()` dump confirmed exactly one
  `accessibilityRole: "button"` node in the rendered tree, carrying the full computed
  label - not two, not zero.
- **`Card` without `onPress` (`TodayGoalRow`'s usage) is confirmed, by reading its
  source, to render a plain, non-`accessible` `View` with no role of its own** - so
  its several independent interactive children (icon-adjacent text, the
  checkbox/counter/add control) are never at risk of being swallowed by the card
  itself, distinct from the `onPress`-provided, single-button-role case
  `TodaysGoalsCard` uses. Both usages are correct for their own shape.
- **Loading and empty-state announcements are present and correct on every screen in
  scope that has a meaningful empty or loading state**, checked individually rather
  than assuming the first screen's correctness generalizes (the exact "one screen
  announces, its sibling doesn't" bug class named A11Y-P9-*/A11Y-P10-001/A11Y-P12-002
  in CLAUDE.md, which this review's brief explicitly asked to check on every screen,
  not just the first one read):
  - `DailyGoalsScreen.tsx`: announces `common.loading` while either `useTodaysGoals`
    or `useAllGoals` is pending, and - once both resolve - announces the correct one
    of its *two* real empty-state titles (`emptyNoneTodayTitle` when goals exist but
    none are scheduled today, `emptyNoGoalsTitle` when the user has never configured
    a goal at all), both distinctly wired, neither silently omitted.
  - `GoalListScreen.tsx`: announces `common.loading`, then `dailyGoals.manage
.emptyTitle` on an empty result.
  - `ReminderListScreen.tsx`: announces `common.loading`, then `dailyGoals.reminders
.emptyTitle` on an empty result.
  - `GoalFormScreen.tsx` / `GoalProgressEntryScreen.tsx` / `ReminderStatsScreen.tsx`:
    each announces `common.loading` while its one relevant query is pending; none has
    a meaningful "empty" state of its own (a form/detail screen, not a list), so no
    gap in this class applies to them - confirmed by reading each screen's full
    render logic, not assumed from the absence of an empty-state UI.
  - No screen in scope explicitly calls `AccessibilityInfo.announceForAccessibility`
    for its *error* state - confirmed this is not a gap, not an oversight: every
    screen in scope renders `components/feedback/ErrorState.tsx` on that path, and
    that shared primitive itself carries `accessibilityLiveRegion="assertive"` +
    `accessibilityRole="alert"` (fixed codebase-wide as finding A11Y-002 in
    `reports/accessibility-2026-08-05-p1.md`), so it self-announces the instant it
    renders with no screen-level call needed - the same mechanism
    `features/calendar/screens/CalendarScreen.tsx` (confirmed by reading it) already
    relies on for its own error branch, with no separate `AccessibilityInfo` call
    either.
- **Every new interactive control's role/label was checked for disambiguation, not
  just presence** - the specific concern named in this review's brief (item 4):
  - `GoalFormScreen`'s icon-picker `Chip`s: each carries its own real label (e.g.
    "Water," "Sleep," "Strength" - never just an icon-name), `Chip.tsx`'s own source
    confirms `accessibilityRole="button"` + `accessibilityState={{ selected }}` on
    every chip, so the selected icon is announced as such.
  - `GoalFormScreen`'s goal-type `Chip` row (Boolean/Counter/Numeric): three
    distinctly-labeled, independently-selectable chips, same `Chip` primitive.
  - `WeekdayPicker`'s seven day chips: each carries its own bare weekday label
    ("Mon," "Tue," ...) plus `Chip`'s own `selected` state - a materially different
    situation from `CalendarMonth`'s A11Y-P12-001 weekday-header finding, since these
    are real, independently *operable* toggle targets (not a static, redundant
    summary row duplicating information already present elsewhere), each announcing
    its own name and on/off state correctly with no ambiguity.
  - `ReminderFormSheetContent`'s scheduled/interval `SegmentedControl`: pre-existing,
    unmodified primitive, already confirmed correct in
    `reports/accessibility-2026-08-19-p12.md` (each segment's label is its own
    visible text).
  - `ReminderFormSheetContent`'s goal-link `Chip` row: "None (standalone)" plus one
    chip per goal, each labeled by the goal's own real name - no ambiguity.
  - `ReminderStatsScreen`'s three `StatTile`s (Done/Not done/Ignored): `StatTile.tsx`
    (pre-existing, unmodified) builds its own composite `accessibilityLabel` from
    `label` + `value` + `unit`, so the three tiles read as "Done, 12" / "Not done, 3" /
    "Ignored, 1" - never three bare, ambiguous numbers.
  - `ReminderFormSheetContent`'s hour/minute `StepperField` pair: the one real gap
    found and fixed above (A11Y-P17-001).
- **`Switch`/`Checkbox` (pre-existing, unmodified primitives) both declare
  `accessibilityLabel` as a required, non-optional prop and set
  `accessibilityRole`/`accessibilityState={{ checked: value }}` correctly**,
  confirmed by reading both sources - every `Switch`/`Checkbox` usage in this
  feature's rows (`GoalCard`, `ReminderRow`, `TodayGoalRow`) passes a real,
  goal/reminder-name-disambiguated label, never a bare default.
- **No hardcoded, untranslated English string anywhere in scope.** A grep across
  every file in scope for `accessibilityLabel="..."` string literals (as opposed to
  `t(...)` calls) found zero matches; every visible `Text` node in scope routes
  through `t()` except bare, non-linguistic punctuation (the `:` separator between the
  hour/minute steppers), which needs no translation.
- **Hit-target sizing**: the one ad hoc `hitSlop` usage in scope
  (`TodayGoalRow.tsx`'s numeric "Add" `PressScale`, `hitSlop={hitSlop.default}`) uses
  the shared design-token value, not a bespoke number - `grep -rn "hitSlop"
features/daily-goals` returns exactly this one, intentional usage.
- **`app/goals/**` and `app/(modals)/goal-progress-entry.tsx` are all thin wrappers
  with no screen body of their own**, per CLAUDE.md's "`app/` never contains screen
  bodies" rule - confirmed by reading every file in the tree, none contains logic
  beyond importing and rendering its feature screen (plus, for the two
  dynamic-param routes, extracting the route param and a defensive `useEffect`
  guard). `app/(modals)/goal-progress-entry.tsx` is presented through Expo Router's
  own native `presentation: 'modal'` (confirmed by reading `app/(modals)/
_layout.tsx`), the same mechanism `rest-timer-settings.tsx`/`plan-day-picker.tsx`
  already use and which this app's own post-P12 bugfix pass confirmed does not suffer
  the custom-`BottomSheet`/RN-`Modal` keyboard/focus issues that pass fixed elsewhere
  - a real native modal screen, not the app's own sheet primitive, so no bespoke
  focus-management code was needed or added here.
- **`features/home/components/TodaysGoalsCard.tsx`'s integration into `HomeScreen.tsx`
  is additive-only and does not disturb any other card's accessibility behavior** -
  confirmed by reading the full render order in `HomeScreen.tsx`: `TodaysGoalsCard` is
  inserted between `LatestPRCard` and `WeeklySummaryCard` with no shared state or
  wrapper change to either neighbor.

---

## Recommendations, priority order

1. **Already fixed in this pass, no action needed**: A11Y-P17-001
   (`ReminderFormSheetContent`'s hour/minute `StepperField` pair now carry distinct,
   translated accessibility labels), verified via a real before/after RNTL mount.
2. **Out of this review's scope, flagged for the orchestrator only**: `features/
profile/screens/RemindersSettingsScreen.tsx` (Gravitus-refresh era, not part of the
   P17 UI surface this review covers) has the identical hour/minute-`StepperField`-
   shared-label pattern this review fixed in `ReminderFormSheetContent.tsx`. A future
   pass touching that file could apply the same two-distinct-keys fix; not attempted
   here since it sits outside the file set this review was scoped to.
3. **No other action needed.** Every other control, screen, and structural pattern
   audited - the `DraggableList`/`GoalCard` move-action wiring, `ReminderRow`'s
   three-independent-control shape, every quick-action's name-disambiguation,
   `TodaysGoalsCard`'s single-node summary shape, loading/empty announcements on
   every screen that needs one, and the thin-wrapper `app/` routing - is correct and
   needed no changes.

## Sign-off

This audit finds **no BLOCKING issue** and does not gate this feature's commit on
accessibility grounds. The specific bug class that blocked P7 and P8 (a `SwipeableRow`
cloning its accessibility props onto a multi-control child) is confirmed absent from
this diff by direct evidence (`grep -rn "SwipeableRow" features/daily-goals app/goals
"app/(modals)/goal-progress-entry.tsx" features/home/components/TodaysGoalsCard.tsx`
returns nothing), and the feature's one `DraggableList` reorder surface
(`GoalListScreen`) was verified, empirically and not just by analogy, to reuse P5's
already-audited move-up/move-down mechanism correctly. One real, non-blocking finding
was found and fixed within this pass: `ReminderFormSheetContent`'s hour and minute
time-of-day steppers shared one identical accessibility label, making their
Increase/Decrease controls indistinguishable to a screen-reader user (MEDIUM, FIXED,
verified via a real before/after RNTL mount). Everything else audited - every
quick-action control's name-disambiguation on `DailyGoalsScreen`, `GoalCard`'s and
`ReminderRow`'s independently-reachable trailing controls, `TodaysGoalsCard`'s
single-accessible-node summary shape matching its Home siblings, every screen's
loading/empty announcement coverage, the icon/type/weekday chip pickers' real
per-option labels, and the thin `app/` wrapper routing - is correct and needed no
changes.
