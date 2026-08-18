# Accessibility Audit Report
**Date**: 2026-08-18
**Scope**: P10 (Home dashboard) on `feat/p10-home-dashboard` -
`features/home/components/{ActivePlanCard,LastWorkoutCard,StreakCard,
LatestPRCard,WeeklySummaryCard}.tsx`, `features/home/screens/{HomeScreen,
PlanDayPickerScreen}.tsx`, plus a quick check of the thin route wrappers
`app/(tabs)/index.tsx` and `app/(modals)/plan-day-picker.tsx`. This is the
accessibility pass named in the P10 task brief (Step 9e,
`/implement-feature`), run by a general-purpose agent standing in for the
accessibility-agent role - the same substitution `reports/
accessibility-2026-08-11-p7.md`, `reports/accessibility-2026-08-11-p8.md`,
and `reports/accessibility-2026-08-13-p9.md` used, per CLAUDE.md and this
task's own instructions.

**Triggered by**: Task brief, prior to commit on `feat/p10-home-dashboard`
(most of the branch's files are untracked, not yet `git add`ed - read
directly via the `Read` tool rather than relying on `git diff main`, which
would have missed them entirely).

**Method**: `git status` first to enumerate every in-scope file (tracked and
untracked), then a full manual read of every file in scope plus every shared
component it renders (`Card`, `Button`, `StatTile`, `ListRow`, `EmptyState`,
`ErrorState`, `Skeleton`, `ConfirmDialog`, `PressScale`, `Screen`) and the
established announcement precedent (`PersonalRecordsScreen.tsx`/
`WorkoutHistoryListScreen.tsx`, per this codebase's own P8/P9 reports). Two
claims that static reading alone could not settle empirically were checked
with real RNTL mounts against the actual screen components (written, run,
and - for the throwaway prop-dump - deleted once its finding was captured
into a permanent regression test; not left in the tree): (1) a full
`git status`/`grep -rn "SwipeableRow"` sweep across `features/home/` and its
tests, confirming zero matches - the P7/P8 `SwipeableRow`-collapse bug class
cannot occur anywhere in this diff, because the primitive is never imported
by it; (2) an RNTL prop dump of `PlanDayPickerScreen`'s pressed row while a
start was in flight, which is what actually surfaced A11Y-P10-002 below (a
static read alone made the row's props *look* like they'd still carry
`busy`/`accessibilityState` - the dump proved they didn't).

## Summary
Total: 2 - **Blocking: 0** | High: 2 | Medium: 0 | Low/Informational: 0

**Verdict: no BLOCKING finding.** P10 does not introduce the `SwipeableRow`-
collapse bug class that blocked P7 and P8 (A11Y-P7-*, A11Y-P8-001):
`grep -rn "SwipeableRow" features/home __tests__/features/home` returns zero
matches, and no card in this diff sets an explicit `accessible` prop on a
wrapper containing more than one interactive control - `ActivePlanCard`'s
three actions (Start, change-day, open-plan) are each their own `Button`
(itself a single `PressScale` with its own `accessibilityRole`/
`accessibilityLabel`), laid out in a plain `Row`/`Column` with no
`accessible` prop anywhere in the tree, so none of them can collapse into a
shared opaque node - confirmed both by direct source read (`Row.tsx`/
`Column.tsx` never touch `accessible`) and by `ActivePlanCard.test.tsx`'s
existing coverage, which already presses the Start and change-day buttons
independently and asserts they fire distinct callbacks with distinct
arguments.

Two real, non-blocking HIGH findings were found in this phase's genuinely
new UI, both fixed within this pass (the same "fix non-blocking findings
same-phase" precedent P8/P9's own reports established) with a real
regression test added and verified to fail before the fix and pass after
(this project's own revert-and-confirm discipline). Both are on
`PlanDayPickerScreen.tsx` specifically - `HomeScreen.tsx` and all five card
components were audited and found correct with no changes needed (see
"Confirmed correct" below).

---

## Findings

### [A11Y-P10-001] `PlanDayPickerScreen` never announced its loading or empty state, while this same phase's `HomeScreen` gets it right in the same diff - HIGH, FIXED
**Category**: Perceivable / transient content - the same violation class this codebase already named twice (A11Y-P8-003, A11Y-P9-002)
**Location**: `features/home/screens/PlanDayPickerScreen.tsx` (before this fix: no `AccessibilityInfo` import at all); contrast with `features/home/screens/HomeScreen.tsx:71-75`'s correct implementation in the same diff, and `features/records/screens/PersonalRecordsScreen.tsx:61-67`'s original precedent.

`PlanDayPickerScreen` renders three bare `Skeleton` rows while `isPending`
and an `EmptyState` for a zero-day plan, exactly like `PersonalRecordsScreen`
and `WorkoutHistoryListScreen` already do - but unlike both of those, and
unlike `HomeScreen.tsx` (this exact phase's own sibling screen, which
correctly fires `AccessibilityInfo.announceForAccessibility(t('common.loading'))`
on `isPending`), `PlanDayPickerScreen` had no `AccessibilityInfo` import and
no announcement of any kind. `Skeleton.tsx`'s own doc comment states the
obligation this hands to the caller ("the loading state itself is
communicated at the screen level... not per-skeleton"), and `EmptyState`
(unlike `ErrorState`) has no built-in announcement of its own - so a
screen-reader user opening "change day" on a multi-day-but-currently-empty
plan, or simply opening it while the query is in flight, got total silence
through both transitions.

**Fix applied** (`features/home/screens/PlanDayPickerScreen.tsx:61-75`): added
the same `isEmpty` derivation and `useEffect`/
`AccessibilityInfo.announceForAccessibility` pair `PersonalRecordsScreen.tsx`
established and `HomeScreen.tsx` already uses correctly in this same diff -
`t('common.loading')` on `isPending`, `t('home.planDayPicker.emptyTitle')`
on the empty transition. The error and not-found branches are deliberately
left alone, same as every other screen in this codebase: both already render
`<ErrorState>`, which self-announces via its own `useEffect` (A11Y-002).

**Regression test**: `__tests__/features/home/screens/PlanDayPickerScreen.test.tsx`,
"announces loading, then the empty-plan title, via AccessibilityInfo" -
verified to fail (no `'Loading'` call recorded) before the fix and pass
after, by temporarily reverting the `useEffect` and re-running.

### [A11Y-P10-002] `PlanDayPickerScreen`'s row nulled its own `onPress` while a start was in flight, silently discarding the `accessibilityRole`/label/`busy` state it had just set two lines below - HIGH, FIXED
**Category**: Operable / state-change communication - an explicitly-set accessibility prop (`busy`) defeated by how the surrounding code was composed
**Location**: `features/home/screens/PlanDayPickerScreen.tsx` (pre-fix lines ~88-94)

Each day row was a `ListRow` with:
```tsx
onPress={
  isStarting
    ? undefined
    : () => void startFromPlanDay(day.id, { navigation: 'replace' })
}
disabled={isStarting}
busy={isStarting}
```
`ListRow.tsx`'s own doc comment on `busy` is explicit about intent -
"mirrors `Button.tsx`'s ... wiring - set while a row-triggered async action
... is in flight, so a screen reader announces 'busy' rather than leaving
`disabled` as the only (unexplained) signal something changed." But
`ListRow`'s implementation only ever sets `accessibilityRole`/
`accessibilityLabel`/`accessibilityState={{ disabled, busy }}` inside its
`onPress`-present branch (`if (!onPress) { return <View>...</View> }` is the
other branch, a plain non-interactive container with none of those props).
Nulling `onPress` the moment `isStarting` flips true - which happens
synchronously, before the async `startFromPlanDay` call even starts (see
`useStartWorkout.ts`'s `run()`: `setIsStarting(true)` runs first, `await
start()` after) - took the just-pressed row (and every other row) out of
that branch entirely, for the whole duration of the async start.

**Empirical proof** (not just static reading): a throwaway RNTL test pressed
a row, held the mocked `sessionService.startFromPlanDay` pending, and dumped
the row's `accessibilityRole`/`accessibilityState`/`accessibilityLabel`
while `isStarting` was `true`:
```
ROW PROPS WHILE STARTING: {}
```
All three were `undefined`. The row was still visually present and looked
identical (same title, same trailing icon, same dimmed styling from
`content`'s own `opacity: disabled ? 0.5 : 1`), but to a screen reader it had
silently become an unlabeled, non-interactive node with no busy signal - the
exact busy announcement the code two lines below was written to produce
never actually reached assistive tech, for every start, every time.

This is not the same mechanism as the `SwipeableRow`-collapse class (nothing
clones an `accessible` prop onto a compound child here), and it is
self-healing once the async call resolves (either navigation away, or
`isStarting` resets to `false` and the row's real accessible branch comes
back) - unlike A11Y-P8-001's permanently-unreachable-controls shape, which is
why this is HIGH rather than BLOCKING. But it is a real, verified, in-file
self-contradiction (the code visibly intends `busy` to be announced and then
defeats its own mechanism), on the one interactive control this entire
screen exists to offer, on every single use.

**Fix applied** (`features/home/screens/PlanDayPickerScreen.tsx:104-120`):
`onPress` is no longer nulled. It's always the real handler; `disabled` alone
gates the tap, the same pattern `Button.tsx` already uses for its own
`loading` state (`PressScale`/RN `Pressable` already refuse to fire `onPress`
once `disabled` is `true` - there was never a need to null the handler on
top of that). This keeps the row in `ListRow`'s accessible branch for the
whole interaction, so `accessibilityRole="button"`, the real title-based
label, and `accessibilityState={{ disabled: true, busy: true }}` all now
survive the in-flight window.

**Regression test**: `__tests__/features/home/screens/PlanDayPickerScreen.test.tsx`,
"keeps the pressed row a labeled, busy button while a start is in flight,
not a bare unlabeled node (A11Y-P10-002 regression)" - asserts
`accessibilityRole`/`accessibilityLabel`/`accessibilityState` directly on the
row while a controlled, still-pending `startFromPlanDay` promise is held
open. Verified to fail (all three `undefined`/wrong) before the fix and pass
after, by temporarily reverting the `onPress` change and re-running both
this test and A11Y-P10-001's test together.

**Note for awareness, not a new finding**: `features/plans/screens/
PlanDetailScreen.tsx:188` has a structurally similar `onStart={isStarting ?
undefined : () => ...}` conditional, pre-existing from P6 and out of this
review's scope (not a P10 file). It differs in one material way that makes
it lower-risk: that `onStart` prop *optionally renders* the entire
`IconButton` (`PlanDayCard.tsx:70`, `{onStart ? <IconButton .../> : null}`)
rather than swapping an already-visible row between an accessible and a
non-accessible variant of itself - the button simply isn't in the tree at
all while starting, so there's no `busy` prop being silently defeated (none
is passed). Flagged here for a future pass to check, not fixed as part of
this review (out of scope, and not a confirmed defect the way A11Y-P10-002
is).

---

## Confirmed correct (checked explicitly, no defect found)

- **No `SwipeableRow`-collapse instance anywhere in `features/home`.**
  `grep -rn "SwipeableRow" features/home __tests__/features/home` returns
  zero matches. The P7/P8 BLOCKING bug class structurally cannot occur in
  this diff because the primitive is never imported.
- **`ActivePlanCard`'s three states, each independently accessible.** The
  outer `Card` never receives an `onPress` in any of the three render paths
  (no-active-plan, active-plan-with-zero-days, suggested-day), so per
  `Card.tsx`'s own doc comment it gets no accessibility role of its own and
  never becomes a `PressScale`/`accessible` wrapper - there is nothing for
  its children to collapse into. The suggested-day case's Start and
  change-day actions are two independent `Button`s (each its own
  `PressScale` with a real `accessibilityRole="button"` and a descriptive,
  non-generic label - "Start Leg Day", not "Start") inside a plain `Row`
  with no `accessible` prop. `ActivePlanCard.test.tsx`'s existing suite
  already presses each by its own `testID` and asserts distinct callback
  arguments, which would not reliably distinguish two controls collapsed
  into one native accessible node - not conclusive proof on its own (RNTL
  cannot simulate native subtree-collapsing, the same caveat CLAUDE.md's
  "Known gaps" section already states for `DraggableList`/`SetRow`), but
  combined with the "no `accessible` prop, no `SwipeableRow`" source-level
  proof above, there is no mechanism by which these three controls could
  collapse.
- **`LastWorkoutCard`'s tap target**: `Card` with a real `onPress` and a
  genuinely descriptive `accessibilityLabel`
  (`t('home.lastWorkout.accessibilityLabelTemplate', { title, date, volume,
  sets })` -> e.g. "Push Day, Aug 12, 4,200 kg, 18 sets"), not a generic
  "View workout" - matches `WorkoutHistoryListScreen`'s `HistoryRow` pattern
  that P9's own review already confirmed correct.
- **`LatestPRCard`'s "informational card, not a button" shape**: no
  `onPress` on its `Card` (records aren't independently routable from Home
  per this phase's plan), so the whole card is wrapped in an outer
  `View accessible accessibilityLabel={...}` instead - exactly mirroring
  `PersonalRecordsScreen.tsx`'s own `PersonalRecordCard` inner component,
  which does the same for the identical reason. No nested interactive
  control exists inside it to be swallowed by that wrapper (every child is
  plain `Text`).
- **`StreakCard`/`WeeklySummaryCard`**: purely informational, no `onPress`
  anywhere. `StreakCard` delegates to `StatTile`, which (per its own
  `!onPress` branch) wraps itself in `View accessible
  accessibilityLabel={...}` built from label/value/unit/delta - the existing,
  unmodified, already-correct pattern. `WeeklySummaryCard` renders a `Card`
  with no `onPress` and a grid of plain `Text` stat pairs with no
  `accessible` wrapper at all, which is the correct default for
  non-interactive content per `Card.tsx`'s own doc comment (read via normal
  linear swipe, not collapsed).
- **`HomeScreen`'s loading announcement, `ConfirmDialog`, and pull-to-refresh
  wiring**: `isPending` correctly fires `AccessibilityInfo.
  announceForAccessibility(t('common.loading'))` (and is the one screen in
  this diff that does this right from the start - `HomeScreen.test.tsx`'s
  own "announces loading, then transitions..." test already asserts it). No
  separate empty-dashboard announcement is needed or missing - unlike a list
  screen, every card always renders real content (its own empty state), so
  there is no pending -> empty transition at the screen level to announce.
  The shared blocked-session `ConfirmDialog` (fired by both Quick Start and
  `ActivePlanCard`'s Start action through one `useStartWorkout` instance) is
  a separate element from every card, reusing the same primitive P1/P8/P9
  already confirmed correct. `Screen.tsx`'s new `refreshControl` prop is
  forwarded straight through to `ScrollView`'s own native `refreshControl`
  prop (a platform primitive, not a new accessible wrapper) - confirmed by
  reading `Screen.tsx`'s diff directly, and independently exercised by
  `HomeScreen.test.tsx`'s own new pull-to-refresh test, which reaches the
  real `onRefresh` callback through `scrollView.props.refreshControl`
  without anything swallowing it.
- **`PlanDayPickerScreen`'s `ConfirmDialog` (blocked-session case) and its
  `ListRow`s are separate, independently reachable elements** - confirmed
  both by source read (distinct components, no shared wrapper) and by the
  existing test suite, which presses a row to trigger the blocked dialog and
  then separately presses the dialog's own "Resume" text, each locating its
  target independently.
- **Hit target sizing**: no ad hoc `hitSlop` overrides and no new small
  custom control anywhere in `features/home` - every interactive element
  goes through `Button` (36/44/52px height by size), `ListRow` (56px
  `minHeight`), or `Card`+`PressScale` with default padding, all
  pre-existing, already-audited primitives. `grep -rn "hitSlop"
features/home` returns zero matches - nothing in this phase invents its own
  target-size handling to get wrong.
- **Thin route wrappers**: `app/(tabs)/index.tsx` and `app/(modals)/
plan-day-picker.tsx` contain no screen body (per CLAUDE.md's rule) and no
  accessibility-relevant logic of their own - both just import and render
  their feature screen, with `plan-day-picker.tsx` adding only a defensive
  `!planId` guard, unchanged from the established `(modals)` route
  convention.

---

## Recommendations, priority order

1. **Already fixed in this pass, no action needed**: A11Y-P10-001 (loading/
   empty announcements) and A11Y-P10-002 (the `onPress`-nulling that defeated
   `ListRow`'s own `busy` state) - both mechanical, both verified via a real
   regression test that fails before the fix and passes after.
2. **Not scoped to this phase, flagged for awareness only**: `PlanDetailScreen.tsx:188`'s
   similar-shaped `onStart={isStarting ? undefined : ...}` conditional (P6,
   pre-existing) is lower-risk than A11Y-P10-002 was (it conditionally
   renders the whole button rather than swapping an already-visible row's
   accessible/non-accessible variant), but worth a look in a future pass
   touching that file.

## Sign-off

This audit finds **no BLOCKING issue** and does not gate this phase's commit
on accessibility grounds. The specific bug class that blocked P7
(`RestTimerBar`) and P8 (`PRBadge`/`SetRow`) - a `SwipeableRow` cloning its
accessibility props onto a multi-control child - is confirmed absent from
this diff by direct evidence (`grep -rn "SwipeableRow" features/home` returns
nothing). Two real, non-blocking HIGH findings were found in this phase's
genuinely new UI, both on `PlanDayPickerScreen.tsx`, and both fixed within
this pass with real regression tests verified against the project's own
revert-and-confirm discipline: a missing loading/empty announcement pair
(A11Y-P10-001, the same violation class A11Y-P8-003/A11Y-P9-002 already
named, recurring here as an in-phase inconsistency against this same diff's
own `HomeScreen.tsx`), and a row that silently lost its `accessibilityRole`/
label/`busy` state during every in-flight start because of how its `onPress`
was conditionally nulled (A11Y-P10-002, confirmed via an RNTL prop dump
showing `{}`, not assumed from source). Everything else audited - all five
card components' interactive/informational structure, `HomeScreen`'s own
loading announcement and pull-to-refresh wiring, both screens' `ConfirmDialog`
reachability, and hit-target sizing throughout - is correct and needed no
changes.
