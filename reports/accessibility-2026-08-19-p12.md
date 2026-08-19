# Accessibility Audit Report

**Date**: 2026-08-19
**Scope**: P12 (Training calendar) on `feat/p11-statistics-and-charts` -
`features/calendar/**` (domain `intensityBinning.ts`/`localDate.ts`/`monthGrid.ts`,
repository `CalendarRepository.ts`/`SqliteCalendarRepository.ts`, hooks
`useCalendarMonth.ts`/`useCalendarYear.ts`/`calendarKeys.ts`, components
`CalendarDayCell`/`CalendarMonth`/`CalendarLegend`/`CalendarDaySessionPicker`/
`CalendarYearHeatmapCard`/`calendarIntensityColors.ts`, and `CalendarScreen.tsx`),
`app/profile/calendar.tsx`, and `features/profile/screens/ProfileScreen.tsx`'s new
"Training calendar" row. Run by a general-purpose agent standing in for the
accessibility-agent role, the same substitution `reports/accessibility-2026-08-11-p7.md`
through `reports/accessibility-2026-08-18-p11.md` used, per CLAUDE.md and this task's
own instructions.

**Method**: read `plans/2026-08-19-p12-calendar.md` for full feature context, then a
full manual read of every file in scope plus the shared primitives it renders
(`ListRow`, `IconButton`, `SegmentedControl`, `ChartCard`, `HeatmapView`,
`PressScale`, `BottomSheet`/`SheetHost`, `EmptyState`). Every claim in this report that
static reading alone could not settle empirically was checked with real RNTL mounts
(`@testing-library/react-native` v14 - note this version's `render()` must be
`await`ed, or the returned `toJSON`/`findByTestId` etc. are `undefined`, a real trap
this review hit and worked around), written as a throwaway scratch file
(`scratch-a11y-p12.test.tsx`, at the repo root rather than under `__tests__/` per this
review's explicit instruction not to touch that directory - a `test-agent` instance is
concurrently writing this feature's permanent component/screen test coverage there)
and deleted once its findings were captured. Checked empirically, not assumed: (1) a
full `grep -rn "SwipeableRow"` sweep across `features/calendar` and
`app/profile/calendar.tsx`, confirming zero matches; (2) a `toJSON()` prop-tree dump of
`CalendarDayCell` in all three of its render branches (outside-month, untrained
current-month, trained/interactive), `CalendarMonth`'s full 42-cell grid, `CalendarLegend`,
`CalendarYearHeatmapCard`, and `CalendarDaySessionPicker`; (3) an `AccessibilityInfo
.announceForAccessibility` spy across four `CalendarScreen` mount scenarios (pending,
resolved-empty month, switched to an empty year, and the reverse) - run once before any
fix (to confirm each gap empirically) and again after (to confirm the fix reaches the
real render/behavior), the same revert-and-confirm... build-then-verify discipline
`reports/accessibility-2026-08-18-p10.md`/`reports/accessibility-2026-08-18-p11.md`
established. `npx tsc --noEmit`, `npx eslint features/calendar i18n/catalogs/en.ts`, and
the full Jest suite were independently re-run after the fixes below to confirm nothing
else regressed.

**Note on a pre-existing/concurrent gap outside this review's scope**: the full Jest
run surfaced one failing test, `__tests__/features/calendar/domain/monthGrid.test.ts`'s
fast-check property test ("always a whole number of full weeks (35 or 42 cells) for any
year/month") - `generateMonthGrid` returns 28 cells for at least one `year`/`month`
combination fast-check found. This is a correctness bug in a pure domain calculator,
not an accessibility defect, `features/calendar/domain/monthGrid.ts` is outside the set
of files this review is permitted to touch, and the failing test itself belongs to the
`test-agent` instance concurrently owning `__tests__/features/calendar/**` - flagged
here for the orchestrator's awareness only, not fixed or further investigated by this
review. (Every day-grid accessibility claim in this report was independently verified
against a real August 2026 grid, which is unaffected by whatever narrower input
triggers the 28-cell case.)

## Summary

Total: 2 - **Blocking: 0** | High: 1 | Medium: 1 | Low/Informational: 1

**Verdict: no BLOCKING finding.** P12 does not introduce the `SwipeableRow`-collapse
bug class that blocked P7 and P8 and was re-confirmed absent in P9-P11:
`grep -rn "SwipeableRow" features/calendar app/profile/calendar.tsx` returns zero
matches (exit code 1) - the primitive is never imported anywhere in this feature, and
in fact every interactive control in this feature (`CalendarDayCell`'s `PressScale`,
`CalendarDaySessionPicker`'s `ListRow`s, `IconButton`/`SegmentedControl`) is a single,
already-correctly-scoped accessible node with nothing else composed under it that could
be swallowed.

Two real, non-blocking findings were found and fixed within this pass (the same "fix
non-blocking findings same-phase" precedent P8-P11's own reports established), both
verified with a real before/after RNTL prop-tree/behavior check: `CalendarMonth`'s
weekday header row exposed seven individually-focusable, context-free "Mon"/"Tue"/...
stops (MEDIUM); and `CalendarScreen` announced the month view's empty state but never
the year view's, an asymmetry within the same file/diff (HIGH). One LOW/informational
note (not fixed - a data/UX gap, not a strict accessibility violation) is recorded
below for completeness.

---

## Findings

### [A11Y-P12-001] `CalendarMonth`'s weekday header row exposed seven individually-focusable, context-free swipe stops instead of one meaningful summary - MEDIUM, FIXED

**Category**: Perceivable / info and relationships (WCAG 1.3.1) - a visual grouping (a
column-header row) with no non-visual equivalent of that grouping
**Location**: `features/calendar/components/CalendarMonth.tsx` (pre-fix: the header
`<View style={{ flexDirection: 'row', ... }}>` had no `accessible`/`accessibilityLabel`
of its own, so each of the seven child `<Text>` nodes - `Mon`/`Tue`/`Wed`/`Thu`/`Fri`/
`Sat`/`Sun` - was independently exposed to the accessibility tree, since RN's default
collapsing behavior only absorbs children into one node when the parent itself opts in
via `accessible`)

A sighted user reads the "Mon Tue Wed Thu Fri Sat Sun" row once and then uses it as
positional context for every cell in the grid below. A VoiceOver/TalkBack user gets no
such benefit: swiping through this row lands on seven separate stops, each announcing
only a bare abbreviation ("Mon", "Tue", ...) with nothing marking it as a calendar
column header, and - because React Native's accessibility tree has no real
header-to-data-cell association API - there is no way for the day cells beneath it to
be announced as "belonging" to a given weekday column anyway. Making it worse: each day
cell's own `accessibilityLabel` (`buildCalendarDayAccessibilityLabel`) already carries
the full date ("August 12, 2026, ..."), not the bare weekday name, so the header row
was not even filling a gap the cells left open - it was seven extra, low-value swipe
stops a screen reader user has to move past to reach the actual grid.

**Empirical proof** (not just static reading): a real RNTL `toJSON()` dump of
`CalendarMonth` rendered with a full August 2026 grid showed the header row's outer
`View` with no accessibility props at all pre-fix, and each of the seven `Text`
children rendered as a plain, separately-reachable node.

**Fix applied**:

- `features/calendar/components/CalendarMonth.tsx`: the header row's outer `View` now
  carries `accessible` + a real, translated `accessibilityLabel` -
  `t('calendar.month.weekdayHeaderAccessibilityLabel')` - the exact same "one
  collapsed node, one summary label" shape `CalendarLegend.tsx` already uses for its
  own static, non-interactive content (confirmed correct and left alone below).
- `i18n/catalogs/en.ts`: new key `calendar.month.weekdayHeaderAccessibilityLabel`,
  `"Days of the week, Monday through Sunday"` - no hardcoded string introduced.

**Verification**: re-ran the same RNTL `toJSON()` dump after the fix - the header
row's outer `View` now shows `{"accessible": true, "accessibilityLabel": "Days of the
week, Monday through Sunday", ...}`, with the seven `Text` children still present in
the tree but no longer independently reachable (RN's standard `accessible`-parent
collapse - the identical mechanism already confirmed correct for `CalendarLegend` in
the "Confirmed correct" section below). `npx tsc --noEmit`/`npx eslint
features/calendar i18n/catalogs/en.ts` both clean; the full Jest suite (139 suites,
1282 passed, 1 pre-existing/concurrent failure unrelated to this change - see the
"Note" above the Summary) shows no new failures caused by this fix.

### [A11Y-P12-002] `CalendarScreen` announced the month view's empty state but never the year view's - an asymmetry within the same file - HIGH, FIXED

**Category**: Perceivable / status messages (WCAG 4.1.3) - matches this project's own
recurring finding class (`reports/accessibility-2026-08-18-p10.md`'s A11Y-P10-001:
"one screen in the diff announces its loading/empty state, a sibling screen in the
same diff does not")
**Location**: `features/calendar/screens/CalendarScreen.tsx` (pre-fix: the
`useEffect` driving `AccessibilityInfo.announceForAccessibility` had a branch for
`view === 'month' && isMonthEmpty` but no equivalent branch for the year view, even
though `isPending` - the branch above it - already covers both views via
`view === 'month' ? monthQuery.isPending : yearQuery.isPending`)

Switching to the "Year" tab when the query resolves to zero trained days for that year
(a real, expected state - a new user, or any year before the user's first workout)
rendered `CalendarYearHeatmapCard`'s own `EmptyState` ("No training yet") correctly on
screen, but nothing ever told a VoiceOver/TalkBack user that state was reached.
`components/feedback/EmptyState.tsx` is a plain, static component with no
`accessibilityLiveRegion`/announcement mechanism of its own (confirmed by reading its
full source - it renders `Text`/`Button` with no accessibility props beyond what its
children carry by default), so nothing downstream compensated either. The result: a
screen-reader user switches views, the "Loading" announcement (shared across both
views) fires and then goes silent, and the only way to discover the year is empty is to
manually explore the screen - the same silent-transition gap this project's own
A11Y-P9-*/A11Y-P10-001 findings already established as a recurring, must-fix class.

**Empirical proof** (not just static reading): a real RNTL mount - `CalendarScreen`
wired to a fake `CalendarRepository` returning `[]` from both `monthOverview` and
`yearOverview`, an `AccessibilityInfo.announceForAccessibility` spy, mount, wait for
the month-empty state, clear the spy, `fireEvent.press` the "Year" tab, wait for
`CalendarYearHeatmapCard`'s empty state to render - showed `announceSpy.mock.calls`
as `[]` pre-fix: zero announcements fired for the entire view switch and empty-year
resolution.

**Fix applied**:

- `features/calendar/screens/CalendarScreen.tsx`: added an `isYearEmpty` memo (`
!yearQuery.data?.some((day) => day.level > 0)` - the identical "no trained day" test
  `CalendarYearHeatmapCard.tsx` already runs internally for its own `ChartCard`
  `isEmpty` prop, duplicated here rather than imported since that component has no
  reason to expose its empty-ness as a callback) and a third branch in the existing
  `useEffect` - `view === 'year' && isYearEmpty` - that announces
  `t('calendar.yearHeatmap.emptyTitle')`, reusing the exact copy
  `CalendarYearHeatmapCard`'s own `ChartCard` `emptyTitle` prop already displays on
  screen (no new i18n key needed - same string, same meaning, one announcement of it
  is enough).

**Verification**: re-ran the same RNTL mount-and-switch-tabs scenario after the fix -
`announceSpy.mock.calls` now shows `[["No training yet"]]` after switching to the
empty year view, confirming the fix reaches the real behavior, not just the source.
The pre-existing month-view announcement scenario (`["Loading"]` then `["Loading",
"No training this month"]`) was re-run unchanged and still passes exactly as before.
`npx tsc --noEmit`/`npx eslint` clean; full Jest suite shows no new failures.

---

## Confirmed correct (checked explicitly, no defect found)

- **No `SwipeableRow`-collapse instance anywhere in this phase's scope.**
  `grep -rn "SwipeableRow" features/calendar app/profile/calendar.tsx` returns zero
  matches (confirmed by exit code, not just eyeballing empty output). The P7/P8
  BLOCKING bug class structurally cannot occur in this diff because the primitive is
  never imported, and independently, every interactive element in this feature
  (`CalendarDayCell`'s `PressScale`, `CalendarDaySessionPicker`'s `ListRow`s,
  `IconButton`, `SegmentedControl`) is the outermost accessible node in its own
  subtree - nothing wraps a compound, multi-control child the way `SwipeableRow` did
  in the P7/P8 bug.
- **`CalendarDayCell`'s non-interactive branches (outside-month and untrained
  current-month) correctly read as static, non-interactive content.** A real RNTL
  dump of both branches shows a plain `View` with `accessible: true` and a real,
  data-summarizing `accessibilityLabel` ("July 31, 2026, outside this month" /
  "August 5, 2026, no training") and, critically, **no** `accessibilityRole`, no
  `focusable`, and no `accessibilityState` - the exact shape a screen reader treats as
  a static label rather than an activatable control, matching the file's own doc
  comment ("don't offer a control with no effect").
- **`CalendarDayCell`'s interactive (trained, current-month) branch correctly exposes
  `accessibilityRole="button"` and its full label at the rendered level, not swallowed
  by any parent.** The RNTL dump shows the outermost node of the rendered subtree
  (`PressScale` -> `Pressable`) carrying `accessibilityRole: "button"`,
  `accessibilityLabel: "August 12, 2026, 1200 kg, Push day"`, `accessible: true`,
  `focusable: true`, `accessibilityState: {}` - and `CalendarMonth`'s own per-cell
  wrapper `View` (the `width: 14.28%, padding` grid cell) carries no `accessible` prop
  of its own that could collapse or intercept it. `PressScale` itself (read at the
  source level) forwards every accessibility prop straight onto a real native
  `Pressable` with no `cloneElement`-based merging - the mechanism that caused the
  P7/P8 `SwipeableRow` bug does not exist in this component at all.
  `buildCalendarDayAccessibilityLabel`'s per-branch templates were also verified
  correct: `Weight.fromKilograms(...).toDisplayString('kg')` returns a bare numeral
  with no unit suffix, so the catalog's `'{{volume}} kg'` template produces "1200 kg",
  not a doubled "1200 kg kg".
- **The 42-cell month grid (verified for August 2026) is announced in a sane
  left-to-right, top-to-bottom reading order.** A full RNTL dump of `CalendarMonth`
  confirms the rendered child order matches `generateMonthGrid`'s own array order
  (July 27 Monday, 28, 29, ... through the trailing days of the next month) - `flexWrap:
'wrap'` at `14.28%` per cell lays this out identically to the array order with no
  reordering, so a linear screen-reader swipe traverses the grid exactly as a sighted
  user reads it, week by week.
- **`CalendarLegend` correctly collapses into one static accessible unit and leaks no
  individually-focusable color swatches.** A real RNTL dump shows the outer `View`
  with `accessible: true, accessibilityLabel: "Training intensity"` and its five
  swatch `View`s plus two "Less"/"More" `Text` children carrying no `accessible` prop
  of their own - confirming (not assuming) that RN's default collapse absorbs them
  into the one parent node, exactly the same mechanism `CalendarMonth`'s
  A11Y-P12-001 fix now also relies on.
- **`CalendarYearHeatmapCard`'s `contentAccessibilityLabel`/`accessibilityLabel`
  wiring gives the Skia-canvas-adjacent `HeatmapView` (an SVG canvas with no native
  accessibility surface of its own, the same class of gap P11's A11Y-P11-001 found and
  fixed for `victory-native` charts) a real textual fallback, confirmed empirically
  rather than assumed from code similarity.** A real RNTL dump shows `ChartCard`'s
  real-content wrapper `View` with `accessible: true, accessibilityRole: "image",
accessibilityLabel: "2026 training activity, 1 training day"` (from
  `contentAccessibilityLabel`), and the underlying `RNSVGSvgView` itself independently
  carrying the same label via `HeatmapView`'s own required `accessibilityLabel` prop -
  both reach the rendered tree, mirroring `YearlyHeatmapCard.tsx`'s already-reviewed
  P11 wiring exactly, this time built from this feature's own translated
  `calendar.yearHeatmap.accessibilityLabel` plural catalog node
  (`{{year}} training activity, {{count}} training day(s)`), not a cross-feature
  string import.
- **`CalendarDaySessionPicker` has correct heading semantics and each row is
  independently reachable and operable.** A real RNTL dump shows "Choose a workout"
  rendered with `accessibilityRole: "header"`, the date subtitle as a plain
  (correctly non-role-bearing) `Text` beneath it, and each session's `ListRow` as an
  independent `accessible: true, accessibilityRole: "button"` node with its own
  distinct `accessibilityLabel` ("Push day" / "Workout" for a `null` plan-day name)
  and `testID` - none of the three collapse into or interfere with each other.
- **The sheet's focus-on-open behavior is already handled by the pre-existing,
  unmodified `BottomSheet`/`SheetHost` primitives, not a gap this feature needed to
  fix.** Read at the source level (not modified by this phase): `BottomSheet.tsx`'s
  sheet content wrapper carries `accessibilityViewIsModal`, the standard RN mechanism
  that constrains iOS VoiceOver focus to the sheet's subtree once it mounts; on
  Android, the wrapping native `Modal` component handles the equivalent focus/window
  announcement on its own. `CalendarDaySessionPicker` renders through this same,
  already-audited mechanism with no bespoke sheet-opening code of its own.
- **The month/year `SegmentedControl` toggle and the prev/next-month `IconButton`s are
  each independently operable and labeled by real translated text, not by icon alone.**
  Both are pre-existing, already-vetted primitives (unmodified by this phase, read at
  the source level): `SegmentedControl`'s per-segment `accessibilityLabel` is the
  segment's own visible text ("Month"/"Year"), and `IconButton`'s
  `accessibilityLabel` prop is required (no valid way to render one without it) -
  `CalendarScreen` passes `t('calendar.month.previousAccessibilityLabel')`/
  `t('calendar.month.nextAccessibilityLabel')` ("Previous month"/"Next month"), real
  translated strings distinct from the chevron icon each button visually shows.
- **`CalendarScreen`'s loading announcement fires correctly for both views, and the
  month-view empty announcement fires correctly, verified via a real RNTL
  `AccessibilityInfo.announceForAccessibility` spy across a full pending -> resolved
  mount cycle** - `["Loading"]` then, once the query settles on an empty month,
  `["Loading", "No training this month"]`. (The year-view equivalent was the gap fixed
  as A11Y-P12-002 above.)
- **`features/profile/screens/ProfileScreen.tsx`'s new "Training calendar" `ListRow`
  is structurally identical to its "Personal records"/"Training history" sibling
  rows** - same `Surface`-wrapped group, same `showChevron`, same `t()`-routed title
  (`calendar.profileRowTitle`), same `testID` naming convention
  (`profile-calendar-row`), and `onPress` routes through the typed
  `routes.profile.calendar()` helper exactly like its siblings route through
  `routes.profile.records()`/`routes.profile.history()`. No regression to the
  existing rows' accessibility behavior - the new row was inserted between them with
  no change to either.
- **No other hardcoded, untranslated English string in any new/changed file in
  scope.** A grep across every file in scope for string-literal `accessibilityLabel=`/
  bare English UI strings found the catalog's `calendar.*` block genuinely used
  everywhere (the one gap, the missing weekday-header label, is A11Y-P12-001, now
  fixed).
- **Hit-target sizing**: no ad hoc `hitSlop` override and no new small custom control
  anywhere in `features/calendar` beyond the already-vetted `IconButton`/
  `SegmentedControl`/`ListRow`/`PressScale` primitives covered above - `grep -rn
"hitSlop" features/calendar` returns zero matches, nothing in this phase invents its
  own target-size handling to get wrong. `CalendarDayCell`'s day circle (32x32 visual)
  sits inside a full grid cell (`width: 14.28%` of screen width with `aspectRatio: 1`,
  well over 44pt on any real device width divided by 7) that is itself the pressable
  target via `PressScale`, not the smaller inner circle - so the effective touch
  target already clears the 44pt minimum without needing `hitSlop`.

---

## Recommendations, priority order

1. **Already fixed in this pass, no action needed**: A11Y-P12-001 (weekday header row
   now one collapsed, translated summary node) and A11Y-P12-002 (year-view empty state
   now announced, matching the month view's existing behavior), both verified via a
   real before/after RNTL check.
2. **For test-agent's follow-up coverage** (per this review's own instruction not to
   add or modify anything under `__tests__/` - a `test-agent` instance is concurrently
   building this feature's permanent suite there): two regression cases are needed,
   built the same way this review's own scratch probes verified the fixes -
   - `CalendarMonth.test.tsx` (or equivalent): render with a real grid and assert the
     weekday header row's container carries `accessible: true` and
     `accessibilityLabel: "Days of the week, Monday through Sunday"`, and/or assert
     `queryByText('Mon')` is not independently reachable as its own accessible element
     (i.e. confirm the collapse, not just the label's presence).
   - `CalendarScreen.test.tsx` (or equivalent): mount with a fake `CalendarRepository`
     returning `[]` from both `monthOverview`/`yearOverview`, spy on
     `AccessibilityInfo.announceForAccessibility`, wait for the month-empty state,
     clear the spy, `fireEvent.press` the "Year" tab, wait for
     `calendar-year-heatmap-card-empty` (or equivalent testID) to render, and assert
     the spy was called with `t('calendar.yearHeatmap.emptyTitle')` ("No training
     yet") - the exact scenario this review's own scratch test used to catch and then
     confirm-fix A11Y-P12-002.
3. **Low-priority, not fixed - a data/UX gap, not a strict accessibility violation
   (LOW/informational)**: `CalendarDaySessionPicker`'s rows are titled only by
   `planDayNames[index]` (or a generic "Workout" fallback) with no time-of-day or
   other disambiguator. Two same-day sessions that both used the same plan day (the
   realistic AM/PM case this picker exists for) render two `ListRow`s with an
   identical visible title and an identical `accessibilityLabel` - both fully
   reachable and independently operable (confirmed above), but a user (sighted or
   screen-reader) has no way to tell which row is the morning session and which is the
   evening one before tapping. Not an accessibility defect in the strict sense (both
   rows are correctly labeled with the information the component has), but worth a
   product decision - e.g. a start-time subtitle - in a future pass. Left unfixed
   since it is a data/design gap (`CalendarDayDto` carries no session start time
   today), not a mechanical accessibility fix.
4. **Out of this review's scope, flagged for the orchestrator only**: a pre-existing/
   concurrent domain bug (`generateMonthGrid` returning 28 cells for some `year`/
   `month` input, caught by `__tests__/features/calendar/domain/monthGrid.test.ts`'s
   own fast-check property test during this review's full-suite re-run) - not an
   accessibility defect, and `features/calendar/domain/monthGrid.ts`/its test file are
   both outside the file set this review is permitted to touch.

## Sign-off

This audit finds **no BLOCKING issue** and does not gate this phase's commit on
accessibility grounds. The specific bug class that blocked P7 and P8 (a `SwipeableRow`
cloning its accessibility props onto a multi-control child) is confirmed absent from
this diff by direct evidence (`grep -rn "SwipeableRow" features/calendar
app/profile/calendar.tsx` returns nothing), and independently, every interactive
control in this feature is already the outermost accessible node in its own subtree
with nothing composed underneath it that could be swallowed. Two real, non-blocking
findings were found and fixed within this pass: `CalendarMonth`'s weekday header row
leaked seven context-free swipe stops instead of one meaningful summary (MEDIUM), and
`CalendarScreen` announced the month view's empty state but silently said nothing when
the year view resolved empty (HIGH, the same "missing announcement in one view, present
in a sibling view in the same diff" class this project's P9/P10 reviews already
established as a recurring must-fix pattern). Both were verified fixed via a real
before/after RNTL mount, not just a code re-read. One LOW/informational note (possible
row-title ambiguity in the rare multi-session-same-plan-day case) is recorded for a
future product decision, not fixed here. Everything else audited - the day-cell
interactive/non-interactive branching, the day-grid's reading order, the legend's
static collapse, the year heatmap's textual fallback, the session picker's heading and
row semantics, the sheet's focus-management (pre-existing, unmodified), the
month/year toggle and navigation buttons' real labels, and the new Profile row's
consistency with its siblings - is correct and needed no changes.
