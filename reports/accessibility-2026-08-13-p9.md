# Accessibility Audit Report
**Date**: 2026-08-13
**Scope**: P9 (workout summary and history) on `feat/p9-workout-summary-history` -
`features/workout-logging/screens/{WorkoutSummaryScreen,WorkoutHistoryListScreen,
WorkoutHistoryDetailScreen}.tsx`, `features/workout-logging/components/
{ShareableSummaryCard,ExerciseThumbnail}.tsx`, `features/workout-logging/components/
ExerciseHeader.tsx`'s thumbnail-extraction refactor, and the small
`features/profile/screens/{ProfileScreen,SettingsScreen}.tsx` diffs (new "Training
history" row and new "Estimated calories" `Switch` row). This is the accessibility
pass named in the P9 task brief, run by a general-purpose agent standing in for the
accessibility-agent role - the same substitution `reports/accessibility-2026-08-11-p7.md`
and `reports/accessibility-2026-08-11-p8.md` used, per CLAUDE.md and this task's own
instructions.
**Triggered by**: Task brief, prior to commit on `feat/p9-workout-summary-history`
(code-review pass already ran and fixed 8 unrelated correctness issues; this review
is accessibility-only, read-only, no files modified).
**Method**: `git diff main` read in full first (49 files, ~5,020 insertions) to scope
exactly what P9 touched, then a manual read-through of every file in scope plus every
shared component it renders (`IconButton`, `Switch`, `ListRow`, `Card`, `PressScale`,
`ErrorState`, `EmptyState`, `Skeleton`, `Toast`, `ConfirmDialog`, `Button`) and the
established announcement precedent (`PersonalRecordsScreen.tsx`/
`ProgressionSettingsScreen.tsx`, per this codebase's own P8 report). Two claims that
static reading alone could not settle empirically were checked with throwaway RNTL
tests (written, run, and deleted - not committed, the same methodology
`reports/accessibility-2026-08-11-p8.md` used): (1) a full prop-tree walk from
`WorkoutSummaryScreen`'s off-screen `ShareableSummaryCard` wrapper up to the screen
root, confirming no `accessibilityElementsHidden`/`importantForAccessibility` prop
exists anywhere in that ancestor chain; (2) a targeted `git diff main --stat`/`grep`
sweep confirming `SetRow.tsx`, `SessionExerciseCard.tsx`, and every other
`SwipeableRow` consumer are byte-identical to `main` and that the string
`"SwipeableRow"` does not appear anywhere in the full diff - i.e. P9 does not
introduce, and cannot have introduced, a third instance of the P7/P8
`SwipeableRow`-collapse bug class, because it never touches the primitive or any of
its consumers.

## Summary
Total: 4 - **Blocking: 0** | High: 2 | Medium: 1 | Low/Informational: 1

**Verdict: no BLOCKING finding.** P9 does not reintroduce the `SwipeableRow`-collapse
bug class that blocked P7 and P8 (A11Y-P7-*, A11Y-P8-001): `SetRow.tsx` and
`SessionExerciseCard.tsx`, the two components with that pre-existing, still-tracked
structural gap, are reused completely unchanged in `WorkoutHistoryDetailScreen`'s edit
mode (confirmed via `git diff main --stat`, zero lines changed in either file), and no
new file in this diff imports or renders `SwipeableRow` at all (confirmed via
`git diff main | grep SwipeableRow`, zero matches across the entire diff). The two
apparent grep hits in `ExerciseHeader.tsx` and `useExerciseMutations.ts` are both
inside doc comments explaining *why* `DraggableList` isn't used for exercise
reordering, not actual usage - read and confirmed non-issues.

That said, two real, non-blocking HIGH findings and one MEDIUM finding were found,
all in the genuinely new UI this phase adds. A11Y-P9-001 (the off-screen share-card
capture target is fully exposed to assistive tech, unlike every other "exists but
shouldn't be perceived" element in this codebase) is the most concrete of the three -
confirmed with an RNTL prop-tree dump, not just a source read. A11Y-P9-002 is the
same violation class this codebase already named and fixed once before this phase
(A11Y-P8-003, "loading state never announced") recurring in two of this phase's three
new screens, while the third new screen in the very same diff gets it right - an
in-phase inconsistency, not a codebase-wide gap. Everything else checked - the
`ConfirmDialog` gating "Delete workout" (title, message, and irreversibility wording),
the new "Estimated calories" `Switch` row's fidelity to the established `haptics.enabled`
pattern, the Share button's label/busy-state/failure-announcement chain, `HistoryRow`'s
single-accessible-target structure, and color/token usage on every new `StatTile`/
`PRBadge`/`Badge` call site - is correct and written up under "Confirmed correct"
below.

---

## Findings

### [A11Y-P9-001] The off-screen `ShareableSummaryCard` capture target is fully exposed to assistive tech instead of hidden, duplicating the entire summary as extra swipe stops - HIGH, REPORT ONLY
**Category**: Perceivable / focus order - visually hidden content left in the accessibility tree
**Location**: `features/workout-logging/screens/WorkoutSummaryScreen.tsx:188-208` (the wrapper `View`), `features/workout-logging/components/ShareableSummaryCard.tsx:28-39` (the component's own doc comment stating the intent this wrapper fails to enforce)

**The mechanism**: `WorkoutSummaryScreen` renders a second, complete copy of the
session summary - eyebrow text, title, date, five or six stat label/value pairs, the
PR badge row, and a footer line - purely so `react-native-view-shot`'s `captureRef`
has something to snapshot for the Share action. The wrapping `View` (lines 189-192)
sets only `pointerEvents="none"` and an off-screen/zero-opacity style:

```tsx
<View pointerEvents="none" style={{ position: 'absolute', top: -9999, left: 0, opacity: 0 }}>
  <ShareableSummaryCard ref={shareCardRef} ... />
</View>
```

`pointerEvents="none"` and `opacity: 0` affect touch handling and visual rendering,
not the accessibility tree - React Native does not treat either as an implicit
accessibility hide. `ShareableSummaryCard`'s own doc comment is explicit about intent:
"Off-screen by design... it exists purely to be captured, never to be looked at
directly in the running app" - but nothing in the wrapper actually enforces that for
a screen-reader user, only for a sighted one.

This codebase has an established, seven-site-strong convention for exactly this
"exists in the tree but must not be perceived" case -
`accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"` -
used by `components/ui/{Spacer,Divider,StatTile,Checkbox,ListRow}.tsx`,
`components/gestures/SwipeableRow.tsx`, `components/feedback/{BottomSheet,Skeleton}.tsx`.
This is the first genuinely off-screen (as opposed to visually-hidden-in-place)
element added to the codebase (`grep -rn "top: -9999\|opacity: 0"` across
`features/`/`components/`/`app/` finds only this one call site), and it's the one
place that doesn't follow the existing pattern.

**Empirical proof** (not just static reading): a throwaway RNTL test rendered a real
`WorkoutSummaryScreen` with a finished, PR-earning session, located the off-screen
card via its `testID`, and walked every ancestor node up to the screen root, dumping
`accessible`/`accessibilityElementsHidden`/`importantForAccessibility` on each:

```
depth=0 type=View :: {"testID":"workout-summary-share-card", ...}
depth=1 type=View :: {"style":{"position":"absolute","top":-9999,"left":0,"opacity":0}}
depth=2 type=View :: {}
depth=3 type=RCTScrollView :: {"style":{"flex":1}}
depth=4 type=RNCSafeAreaView :: {"testID":"workout-summary-screen", ...}
```

Zero nodes in this chain carry `accessibilityElementsHidden` or
`importantForAccessibility`. Nothing hides this subtree from VoiceOver/TalkBack.
Independent corroboration from this phase's own committed test suite:
`__tests__/features/workout-logging/screens/WorkoutSummaryScreen.test.tsx`'s own
comment states "'Push Day' renders twice - once in the on-screen body, once in the
off-screen `ShareableSummaryCard`" and uses `findAllByText` specifically to tolerate
the duplication - the test author already knew the content renders twice, but the
fix applied was a test-query workaround, not an accessibility hide.

**User impact**: a VoiceOver/TalkBack user swiping through `WorkoutSummaryScreen` -
title, share button, workout title, date, PR badge, five-to-six stat tiles, Done
button - reaches the end of the real content and then, unexpectedly, swipes into a
second, near-identical read-through: "GymTracker" (eyebrow), the workout title again,
the date again, duration/exercises/sets/reps/volume/calories again (in a
slightly different template - `{{value}} kg` here vs. the on-screen tile's own
unit-suffix layout there), the PR count again, and "Logged with GymTracker." This is
every user's first visit to this screen after every single finished workout - not an
edge case. Nothing marks it as duplicate or explains why it's there; it reads as
either a rendering bug or a second, differently-worded summary that disagrees
slightly with the first.

**Fix shape**: add `accessibilityElementsHidden` and
`importantForAccessibility="no-hide-descendants"` to the wrapper `View` at
`WorkoutSummaryScreen.tsx:189-192`, mirroring `BottomSheet.tsx:126-128`'s identical
"off-screen/inert but present for layout purposes" usage. This is a two-prop, one-line
fix - no restructuring, no design decision, unlike A11Y-P8-001's `SetRow` fix.

### [A11Y-P9-002] `WorkoutSummaryScreen` and `WorkoutHistoryDetailScreen` never announce their loading-skeleton state, while the third new P9 screen in the same diff does it correctly - HIGH, REPORT ONLY
**Category**: Perceivable / transient content - the same violation class this codebase already named and fixed once (A11Y-P8-003)
**Location**: `features/workout-logging/screens/WorkoutSummaryScreen.tsx:113-114,213-220`; `features/workout-logging/screens/WorkoutHistoryDetailScreen.tsx:168-173`; contrast with `features/workout-logging/screens/WorkoutHistoryListScreen.tsx:59-65`

`WorkoutSummaryScreen` renders `<WorkoutSummarySkeleton />` (two bare `Skeleton`
components) while `isSummaryPending`, and `WorkoutHistoryDetailScreen` renders three
bare `Skeleton` components while `isPending` - neither file imports
`AccessibilityInfo`, and `grep -n "AccessibilityInfo" ` on both returns nothing.
`Skeleton.tsx`'s own doc comment (line 24) states the obligation this hands to the
caller in plain language: "Hidden from screen readers entirely: a loading skeleton
has no meaningful content to announce, and the loading state itself is communicated
at the screen level (e.g. an `accessibilityLiveRegion` 'Loading' announcement from the
containing view), **not per-skeleton**." Neither screen's containing view picks that
obligation up.

This is not a codebase-wide gap rediscovered - it's the *specific* violation
`reports/accessibility-2026-08-11-p8.md`'s A11Y-P8-003 already found and fixed on
`PersonalRecordsScreen.tsx`, using the exact `useEffect` +
`AccessibilityInfo.announceForAccessibility(t('common.loading'))` pattern that
`ProgressionSettingsScreen.tsx` and `UnitsSettingsScreen.tsx` already established.
What makes this an in-phase inconsistency rather than a fresh unknown-precedent
finding: **`WorkoutHistoryListScreen.tsx`, the third new screen in this exact same
diff**, gets this right -

```tsx
// Same rationale `PersonalRecordsScreen.tsx` documents for its own
// pending/empty announcements: `Skeleton`/`EmptyState` don't announce
// themselves, and the error branch is left alone because `ErrorState`
// already announces its own message.
useEffect(() => {
  if (isPending) {
    AccessibilityInfo.announceForAccessibility(t('common.loading'));
  } else if (isEmpty) {
    AccessibilityInfo.announceForAccessibility(t('workoutLogging.history.emptyTitle'));
  }
}, [isPending, isEmpty]);
```

- with a comment that names the exact rationale the other two screens needed and
didn't get. The pattern was known, written, and committed within this same phase; it
simply wasn't applied to its two siblings.

**Mitigating context, checked explicitly rather than assumed**: the *error* branches
of both screens are fine without their own announcement - both render `<ErrorState>`,
which self-announces via its own `useEffect` (`components/feedback/ErrorState.tsx:27-29`),
confirmed by reading that component directly. `WorkoutHistoryDetailScreen`'s `!session`
("not found") branch also renders `<ErrorState>` and is covered the same way. Only the
*pending* transition is silent on both screens - the loaded/success state is treated as
lower-priority by this codebase's own existing convention (a non-empty screen
self-announces via normal swipe exploration), consistent with how P8's own report
handled that same distinction.

**Fix shape**: add the same `useEffect`/`AccessibilityInfo.announceForAccessibility(t('common.loading'))`
pair to both screens' `isPending`/`isSummaryPending` transitions, copying
`WorkoutHistoryListScreen.tsx:59-65`'s own same-phase implementation (or
`ProgressionSettingsScreen.tsx`'s, the original precedent) essentially verbatim - a
small, mechanical fix, not a design decision.

### [A11Y-P9-003] Toggling "Edit"/"Done editing" on `WorkoutHistoryDetailScreen` silently swaps every exercise card's structure with no announcement of the mode change - MEDIUM, REPORT ONLY
**Category**: Perceivable / operable - focus and state-change communication
**Location**: `features/workout-logging/screens/WorkoutHistoryDetailScreen.tsx:75-81` (`handleToggleEdit`), `192-202` (the toggle `Button`), `264-297` (the conditional `SessionExerciseCard`/`ReadOnlyExerciseCard` swap)

Pressing the header's Edit/"Done editing" `Button` flips `isEditing` and re-renders
every item in `session.exercises` from `ReadOnlyExerciseCard` (a flat, mostly
non-interactive text summary - name, note, and each set as a single read-only line)
to the full `SessionExerciseCard` (move-up/move-down controls, a remove-exercise
button, an inline note editor, and every `SetRow` with its checkbox, two number
fields, swipe actions, and expandable set-type/RPE/note editor) - or back. This is a
substantial structural change to potentially many cards at once, not a cosmetic one.

The only signal a screen-reader user gets is the toggle button's own label changing
from "Edit" to "Done editing" (`t('workoutLogging.history.editButtonLabel')` /
`doneEditingButtonLabel`) - correct and non-generic as far as it goes, but it
describes the *button's next action*, not what just happened to the rest of the
screen. Nothing calls `AccessibilityInfo.announceForAccessibility` on the `isEditing`
transition, and nothing moves or refocuses - which is the right call for *avoiding*
focus-stealing (an unsolicited focus jump would be its own violation), but it means a
user who presses Edit and doesn't proactively continue swiping downward has no way to
know the exercise list beneath them just became editable, or - on the way back out of
edit mode - that their edits are now display-only again. This is the same underlying
failure mode (a mode transition happens "silently," discoverable only by blind
exploration) A11Y-P8-003 named for `PersonalRecordsScreen`'s state transitions,
applied here to a user-initiated toggle rather than an async load - which is why this
is MEDIUM rather than HIGH: the user did just perform an action and receives *some*
signal (the button's own label), unlike A11Y-P8-003's fully passive, unsignaled
transitions.

**Fix shape**: a one-time `AccessibilityInfo.announceForAccessibility` call in
`handleToggleEdit`, keyed on the `next` value - e.g. announcing
`t('workoutLogging.history.editModeEnabledAnnouncement')` /
`editModeDisabledAnnouncement` (new strings) alongside the existing
`setIsEditing(next)` call. Small and mechanical, not a restructuring.

---

## Confirmed correct (checked explicitly, no defect found)

- **No third `SwipeableRow`-collapse instance.** `git diff main --stat` shows zero
  changes to `SetRow.tsx` or `SessionExerciseCard.tsx`, and `git diff main | grep
SwipeableRow` returns zero matches across the entire 49-file, ~5,020-line diff. P9
  reuses the pre-existing, already-tracked-as-a-Known-Gap `SetRow` (CLAUDE.md's
  "Known gaps" entry on `SetRow.tsx`'s checkbox/field/focus-button collapse) unchanged
  in a new call site (`WorkoutHistoryDetailScreen`'s edit mode), which means that
  pre-existing, non-blocking, on-device-unverified gap is now reachable from a second
  screen - worth a one-line mention for completeness, not a new finding, since P9
  neither created nor worsened it and the codebase's own "Known gaps" section already
  tracks it with the correct caveats.
- **`ConfirmDialog` gating "Delete workout"** (`WorkoutHistoryDetailScreen.tsx:323-332`):
  reuses the same `ConfirmDialog` primitive P1's A11Y-006 and P8's own review already
  confirmed correct (`accessibilityViewIsModal` paired with `accessible={false}` on
  the same content container, keeping title/message/Cancel/Delete independently
  reachable). Its message is concrete and states the consequence plainly rather than
  generically: "This permanently deletes the workout and every set logged in it, and
  recalculates any personal records it held. This cannot be undone."
  (`i18n/catalogs/en.ts:451-453`) - exactly the non-generic, irreversibility-naming
  bar the task brief asked to verify.
- **The delete button's in-flight state**: `Button` (not a bare `ListRow` +
  `ActivityIndicator`, the shape A11Y-P8-004 flagged) with `loading={isDeleting}` and
  `disabled={mutations.isMutating}` - `Button.tsx`'s existing `loading` prop already
  sets `accessibilityState={{ disabled: isDisabled, busy: loading }}`, so this row
  gets a correct busy signal for free by using the already-solved primitive.
- **The new "Estimated calories" `Switch` row** (`SettingsScreen.tsx:99-111`) is
  structurally identical to the existing `haptics.enabled` row three rows above it
  (`SettingsScreen.tsx:79-91`) - same `disabled={pending}`, same
  `accessibilityLabel={title}` (not a generic "Toggle" or "Switch"), same absence of a
  `busy` concept (matching, not regressing from, the haptics row's own established
  shape). `components/ui/Switch.tsx` wraps RN's native `Switch` with a real
  `accessibilityRole="switch"` and `accessibilityState={{ disabled, checked: value }}`,
  unchanged by this phase. The row's subtitle
  ("Show a rough calorie estimate on the workout summary") is concrete, not filler.
- **`WorkoutHistoryListScreen`'s `HistoryRow`** (`WorkoutHistoryListScreen.tsx:139-167`):
  a single `PressScale` with `accessibilityRole="button"` and a genuinely descriptive,
  non-generic label (`t('workoutLogging.history.rowAccessibilityLabelTemplate',
{ title, date, sets, volume })` -> "{{title}}, {{date}}, {{sets}} sets,
  {{volume}} kg") wraps a `Card` rendered *without* its own `onPress` - confirmed via
  `Card.tsx:29-33`'s own doc comment that a `Card` with no `onPress` gets no
  accessibility role of its own, so there is exactly one accessible, tappable node per
  row, not a nested-button double-announcement.
- **`WorkoutHistoryListScreen`'s own loading/empty announcements** (lines 59-65,
  quoted in full under A11Y-P9-002 above): correctly implemented, the precedent the
  other two new screens should have followed.
- **The Share action's full failure/unavailable path**
  (`WorkoutSummaryScreen.tsx:60-93,102-110`): the `IconButton` has a real,
  non-generic `accessibilityLabel` ("Share workout summary", required by
  `IconButton`'s own type - it has no icon-only-no-label escape hatch), and
  `IconButton.tsx:66-77` already sets `accessibilityState={{ disabled: isDisabled,
busy: loading }}` from its `loading` prop, so a screen-reader user gets a correct
  busy signal while `isSharing` is true with zero new code needed. Both failure paths
  (`Sharing.isAvailableAsync()` returning `false`, and the `catch` block for a failed
  capture/share) route through `useToastStore().show()`, and `Toast.tsx:44-49` already
  calls `AccessibilityInfo.announceForAccessibility(message)` unconditionally on
  mount (documented there as the fix for A11Y-002 from
  `reports/accessibility-2026-08-05-p1.md`) - so a failed or unavailable share is
  never silent for a screen-reader user, confirmed by reading `Toast.tsx` directly
  rather than assuming the existing primitive still behaves this way.
- **Color/token usage**: every new `StatTile` call (`WorkoutSummaryScreen.tsx`,
  `WorkoutHistoryDetailScreen.tsx`'s `StatColumn`) and the reused, unmodified
  `PRBadge` (`WorkoutSummaryScreen.tsx:129`, `ShareableSummaryCard.tsx:133-136`) pass
  no ad hoc color values - all styling comes from component defaults or
  `theme/tokens.ts` (`color.accentSubtle`, `color.accentText`, `color.success`,
  `color.textTertiary` in `ReadOnlyExerciseCard`'s set-status icon). No new `Badge`
  variant or one-off hex/rgb literal was introduced anywhere in this diff.
  `PRBadge` on `WorkoutSummaryScreen` is rendered as a plain top-level `Column` child
  (`WorkoutSummaryScreen.tsx:128-130`), not nested inside any `SwipeableRow` or other
  collapsing container - the correct, "sibling, not nested" placement A11Y-P8-001's
  own fix established as the safe shape.
- **`ExerciseHeader.tsx`'s thumbnail-extraction refactor** (now delegating to the new
  `ExerciseThumbnail.tsx`): a pure extract-a-shared-component change, verified via
  `git diff main` line-by-line - the resulting markup, accessibility props, and
  fallback-icon behavior are identical to what `ExerciseHeader.tsx` inlined before,
  just deduplicated against `WorkoutHistoryDetailScreen`'s new `ReadOnlyExerciseCard`.
  No accessibility regression from the refactor itself. `ExerciseThumbnail`'s bare
  `<Image>`/`<Ionicons>` fallback carries no explicit `accessibilityLabel` or hiding
  prop, same as the code it replaced - low practical impact since it always sits
  immediately beside the exercise's own name `Text` (already announced) in both call
  sites, and RN's `Image` component is not accessible by default without an explicit
  `accessibilityLabel` (unlike `Text`), so this doesn't newly expose anything. Noted
  for completeness (a decorative image without `importantForAccessibility="no"` a
  more careful implementation would set, matching `ExerciseImageGallery.tsx:90-94`'s
  own established pattern for a *meaningful* image done correctly) rather than as a
  fourth numbered finding - LOW/informational, an inherited pre-P9 pattern, not a
  regression.

---

## Recommendations, priority order

1. **Small, mechanical, no design decision needed**: add
   `accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"`
   to `WorkoutSummaryScreen.tsx:189-192`'s off-screen wrapper (A11Y-P9-001) - the
   two-prop pattern this codebase already uses in seven other places for exactly this
   situation.
2. **Small, mechanical, copy an existing same-phase implementation**: add the
   `useEffect` + `AccessibilityInfo.announceForAccessibility(t('common.loading'))`
   pattern to `WorkoutSummaryScreen.tsx` and `WorkoutHistoryDetailScreen.tsx`'s
   pending-state branches (A11Y-P9-002), copying
   `WorkoutHistoryListScreen.tsx:59-65`'s own sibling implementation from this same
   diff.
3. **Small, mechanical**: add a one-time `AccessibilityInfo.announceForAccessibility`
   call in `WorkoutHistoryDetailScreen.tsx`'s `handleToggleEdit` (A11Y-P9-003),
   announcing which mode the screen just entered.
4. **Not scoped to this phase, flagged for awareness only**: `SetRow`'s pre-existing,
   already-tracked `SwipeableRow`-collapse gap (CLAUDE.md's "Known gaps" section) is
   now reachable from a second screen (`WorkoutHistoryDetailScreen`'s edit mode) in
   addition to `ActiveWorkoutScreen`. No action needed from this phase - the existing
   tracked caveats (device-unverified, requires a structural decision, do not attempt
   without on-device VoiceOver/TalkBack verification first) already cover this new
   call site as-is.

## Sign-off

This audit finds **no BLOCKING issue** and does not gate this phase's commit on
accessibility grounds. The specific bug class that blocked P7 (`RestTimerBar`) and P8
(`PRBadge`/`SetRow`) - a `SwipeableRow` cloning its accessibility props onto a
multi-control child - is confirmed absent from this diff by direct evidence
(`git diff main | grep SwipeableRow` returns nothing; the two files that carry the
pre-existing version of that gap are byte-identical to `main`). Three real,
non-blocking gaps were found in this phase's genuinely new UI: an off-screen share
capture target left exposed to assistive tech instead of hidden (A11Y-P9-001, HIGH,
confirmed via RNTL prop-tree dump), two of this phase's three new screens missing the
loading-state announcement its own third sibling screen implements correctly in the
same diff (A11Y-P9-002, HIGH), and a user-initiated edit-mode toggle that
restructures the screen with no announcement beyond its own button's label
(A11Y-P9-003, MEDIUM). All three have small, mechanical fixes with an existing
in-codebase precedent to copy from - none require the kind of structural redesign
A11Y-P8-001's `SetRow` fix needed. Everything else audited - the delete
confirmation's wording and reachability, the new settings toggle's fidelity to its
established sibling pattern, the Share action's full label/busy/failure-announcement
chain, `HistoryRow`'s single-accessible-node structure, and token-only color usage
throughout - is correct and needs no changes.
