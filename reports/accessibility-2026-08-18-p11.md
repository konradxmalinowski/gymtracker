# Accessibility Audit Report

**Date**: 2026-08-18
**Scope**: P11 (Statistics and charts) on `feat/p11-statistics-and-charts` -
`features/statistics/**` (repository, domain, hooks, components
`StatRangeSelector`/`VolumeChartCard`/`FrequencyChartCard`/`DurationTrendCard`/
`MuscleVolumeCard`/`YearlyHeatmapCard`/`ExerciseProgressionCard`, and screens
`StatisticsScreen.tsx`/`ExerciseProgressionScreen.tsx`), `components/charts/**`
(`ChartCard`, `LineChartView`, `BarChartView`, `StackedBarChartView`,
`HeatmapView`, `ChartTooltip`, `ChartLegend`), the new `app/(tabs)/stats/**`
nested Stack (`_layout.tsx`, `index.tsx`, `exercise/[exerciseId].tsx`), and
`features/exercise-library/screens/ExerciseDetailScreen.tsx` +
`app/(tabs)/exercises/[id].tsx`'s new third slot (`progressChartSlot`). Run by
a general-purpose agent standing in for the accessibility-agent role, the same
substitution `reports/accessibility-2026-08-11-p7.md` through `reports/
accessibility-2026-08-18-p10.md` used, per CLAUDE.md and this task's own
instructions.

**Method**: `git status` first to enumerate every in-scope file (tracked and
untracked - most of this branch is untracked, mirroring P10's own note), then
a full manual read of every file in scope plus the shared primitives it
renders (`Section`, `Surface`, `Skeleton`, `EmptyState`, `SegmentedControl`,
`Button`). Two claims that static reading alone could not settle empirically
were checked with real RNTL mounts (`@testing-library/react-native` v14,
`await render(...)`), written as a throwaway scratch file
(`__tests__/scratch-a11y-p11.test.tsx`) and deleted once its findings were
captured: (1) a full `grep -rn "SwipeableRow"` sweep across
`features/statistics`, `components/charts`, and `app/(tabs)/stats`, confirming
zero matches; (2) a `toJSON()` prop-tree dump of `VolumeChartCard` and
`YearlyHeatmapCard` rendered with real data, run once _before_ any fix (to
confirm the gap empirically rather than assume it from source) and again
_after_ the fix (to confirm the fix actually reaches the rendered tree) - the
same revert-and-confirm discipline P7-P10's own reports established, applied
here as build-then-verify rather than fix-then-revert since the "before" state
was the code as delivered. The full existing Jest suite (135 suites, 1228
passed, 1 pre-existing skip) and `npx tsc --noEmit`/`npx eslint` were
independently re-run after the fixes below to confirm nothing else regressed;
a `test-agent` subagent is concurrently writing this feature's permanent test
suite, so no new permanent test file was added by this review.

## Summary

Total: 2 - **Blocking: 0** | High: 1 | Medium: 1 | Low/Informational: 0

**Verdict: no BLOCKING finding.** P11 does not introduce the `SwipeableRow`-
collapse bug class that blocked P7 and P8 and was re-confirmed absent in P9/
P10: `grep -rn "SwipeableRow" features/statistics components/charts
"app/(tabs)/stats"` returns zero matches (exit code 1) - the primitive is
never imported anywhere in this diff.

One real, non-blocking HIGH finding was found in this phase's genuinely new,
load-bearing concern - the chart components themselves - and fixed within this
pass with a real before/after RNTL verification (the same "fix non-blocking
findings same-phase" precedent P8-P10's own reports established): every chart
built on `victory-native`'s Skia canvas (`LineChartView`/`BarChartView`, used
by `VolumeChartCard`, `FrequencyChartCard`, `DurationTrendCard`,
`ExerciseProgressionCard`) rendered with **zero** accessibility surface at
all - not mislabeled, not partially reachable, but a confirmed, empirically-
verified silent dead zone for VoiceOver/TalkBack. One further MEDIUM finding
(the yearly heatmap's `accessibilityLabel` was hardcoded English, not routed
through `t()`, and described the chart type rather than its actual data) was
fixed in the same pass.

---

## Findings

### [A11Y-P11-001] Every Skia-canvas chart (`LineChartView`/`BarChartView`, backing four of five dashboard cards) had zero accessibility surface - a confirmed silent dead zone, not a mislabeling - HIGH, FIXED

**Category**: Perceivable / non-text content (WCAG 1.1.1) - this is the review scope's own flagged "real, load-bearing" question for this feature, not a boilerplate check
**Location**: `components/charts/{LineChartView,BarChartView}.tsx` (pre-fix: no `accessibilityLabel`/`accessible`/`accessibilityRole` prop anywhere in either file), consumed by `components/charts/ChartCard.tsx`'s real-content branch (pre-fix: `<View testID={testID}>{children}</View>`, also with no accessibility props), reached from `features/statistics/components/{VolumeChartCard,FrequencyChartCard,DurationTrendCard,ExerciseProgressionCard}.tsx`.

`CartesianChart` (from `victory-native`, Victory Native XL) renders through
`@shopify/react-native-skia`'s `Canvas` - a single native drawing surface that
paints pixels directly and exposes no per-shape accessibility nodes to either
platform's accessibility tree. Nothing downstream of it compensated: neither
`LineChartView`/`BarChartView` (no accessibility props on their own wrapping
`View`) nor `ChartCard`'s real-content `View` (also bare) supplied any
textual fallback. For a VoiceOver/TalkBack user, four of this dashboard's five
cards - Volume, Workout frequency, Session duration, and the per-exercise
Progression chart (both on its own screen and inline in
`ExerciseDetailScreen`'s new slot) - had a real, correctly-labeled `Section`
header and (where present) subtitle, then nothing: swiping past the header
landed nowhere inside the actual chart, with no announcement of what the data
showed, its range, or even that a chart was present at all. This is distinct
from a mislabeled control; it's a complete absence of a non-visual equivalent
for the one thing this entire phase exists to present.

**Empirical proof** (not just static reading): a throwaway RNTL `toJSON()`
dump of `VolumeChartCard` rendered with two real data points showed the real-
content `View` (wrapping the mocked Skia canvas stand-in) with **no**
accessibility props of any kind - `{"type": "View", "props": {"testID":
"probe-volume"}, ...}` - confirming the gap exists in the actual rendered
tree, not just in a static read of the source.

**Fix applied**:

- `components/charts/ChartCard.tsx`: added an optional `contentAccessibilityLabel`
  prop. When supplied, the real-content wrapper `View` gets
  `accessible={true} accessibilityRole="image" accessibilityLabel={contentAccessibilityLabel}`,
  collapsing the otherwise-invisible canvas content into one meaningful
  VoiceOver/TalkBack stop. When omitted, behavior is byte-identical to before
  - deliberately, so chart content that is _already_ independently accessible
    (`StackedBarChartView`'s real per-row `Text` labels/values, used by
    `MuscleVolumeCard`) is never passed this prop and keeps its existing,
    correct, individually-navigable rows rather than being collapsed into one
    opaque node - the exact `SwipeableRow`-style collapse this project's other
    accessibility reviews have repeatedly flagged and fixed elsewhere, which
    this fix is careful not to reintroduce from a different direction.
- `components/charts/summarizeSeries.ts` (new): a small, generic
  `{count, min, max}` reducer over a chart's own already-passed `SeriesPoint[]`
  data - lives in `components/charts` (not a feature) since it operates only
  on the adapter's own generic type, no domain knowledge, consistent with
  ADR-0010's "adapter, zero domain knowledge" rule. Exported from the barrel.
- `features/statistics/components/{VolumeChartCard,FrequencyChartCard,
DurationTrendCard,ExerciseProgressionCard}.tsx`: each now computes a real
  summary from its own data and passes a translated, unit-aware
  `contentAccessibilityLabel` through `ChartCard` - e.g. `"Volume chart, 12
periods, ranging from 1200 to 3400 kg"`, `"Workout frequency chart, 12
periods, ranging from 2 to 5 workouts"`, `"Top set progression chart, 52
periods, ranging from 60 to 100 kg"`. Four new `statistics.*.accessibilityLabelTemplate`
  keys were added to `i18n/catalogs/en.ts` for this, all routed through `t()`
  - no hardcoded English introduced by the fix itself.

**Verification**: re-ran the same RNTL `toJSON()` dump after the fix -
`VolumeChartCard`'s real-content `View` now shows
`{"accessible": true, "accessibilityRole": "image", "accessibilityLabel":
"Volume chart, 2 periods, ranging from 1000 to 2000 kg"}`, confirming the fix
reaches the rendered tree. `MuscleVolumeCard` (deliberately not given
`contentAccessibilityLabel`) was confirmed unaffected by code review - its
call site was not touched. The full pre-existing Jest suite (135 suites, 1228
passed) and every already-written (in-progress) `__tests__/features/statistics/**`/
`__tests__/components/charts/**` test still pass unchanged after this fix;
`npx tsc --noEmit` and `npx eslint .` are both clean. No permanent test file
was added by this review (a `test-agent` subagent is concurrently building
this feature's real suite); the scratch probe file was deleted after use.

### [A11Y-P11-002] `HeatmapView`'s `accessibilityLabel` was hardcoded, untranslated English, and described the chart type rather than the actual data it renders - MEDIUM, FIXED

**Category**: Perceivable / non-text content + i18n convention (this codebase's `t()`-everywhere rule, CLAUDE.md/roadmap DoD)
**Location**: `components/charts/HeatmapView.tsx:47` (pre-fix: `<Svg ... accessibilityLabel="Yearly training activity heatmap">`)

Unlike `LineChartView`/`BarChartView`, `HeatmapView` did supply _some_
`accessibilityLabel` on its underlying `react-native-svg` `<Svg>` root, so
this is not a total silence - but two real problems remain: (1) the string
was a literal, hardcoded in `components/charts` (a shared, cross-feature
directory that already routes every other string through `t()` -
`components/ui/Chip.tsx`, `components/feedback/EmptyState.tsx`, etc. - so this
was the one hardcoded-English hit across the entire new `.tsx` surface in
scope, confirmed by grepping every new file for un-translated string
literals/`accessibilityLabel`s); (2) it was static regardless of the actual
`year`/`days` passed in - a screen reader user got "Yearly training activity
heatmap" whether the year had zero training days or two hundred, with no way
to know the heatmap's actual content without visual inspection, defeating the
point of an accessibility label on a data visualization.

**Fix applied**:

- `components/charts/HeatmapView.tsx`: `accessibilityLabel` is now a required
  prop instead of a hardcoded literal - this adapter has no domain knowledge
  of its own to build a real one from, so the caller must supply it (documented
  in the prop's own doc comment, matching this project's convention of
  encoding a real constraint in a type rather than a comment alone).
- `features/statistics/components/YearlyHeatmapCard.tsx`: computes
  `activeDayCount` (days with `level > 0`) and builds a real, translated,
  correctly-pluralized label via a new `statistics.heatmap.accessibilityLabel`
  catalog key (a `{one, other}` plural node, e.g. `"2026 training activity
heatmap, 1 training day"` vs. `"2026 training activity heatmap, 42 training
days"`), passed to both `HeatmapView` directly and to `ChartCard`'s new
  `contentAccessibilityLabel` (the SVG's own 365+ individual `Rect` day cells
  are not independently reachable or meaningful as separate VoiceOver/TalkBack
  stops - one summary is strictly better than that, and the grid is not
  interactive: `grep -n "onPress" features/statistics/components/YearlyHeatmapCard.tsx
components/charts/HeatmapView.tsx` returns nothing, so the roadmap DoD's
  "if interactive" touch-target requirement for the day-cell heatmap does not
  apply here).

**Verification**: the RNTL dump (same probe as A11Y-P11-001) confirms the
rendered `RNSVGSvgView`'s `accessibilityLabel` prop now reads `"2026 training
activity heatmap, 1 training day"` for a one-active-day fixture, correctly
selecting the singular plural branch. `npx tsc --noEmit`/`npx eslint .` clean;
the pre-existing test suite unaffected.

---

## Confirmed correct (checked explicitly, no defect found)

- **No `SwipeableRow`-collapse instance anywhere in this phase's scope.**
  `grep -rn "SwipeableRow" features/statistics components/charts
"app/(tabs)/stats"` returns zero matches (confirmed by exit code, not just
  eyeballing empty output). The P7/P8 BLOCKING bug class structurally cannot
  occur in this diff because the primitive is never imported.
- **`StackedBarChartView` (backing `MuscleVolumeCard`) is already correctly
  accessible and was deliberately left unmodified.** Each body-part slice
  renders as a real `Text` label + a real `Text` value in a plain `View` with
  no `accessible` wrapper - individually swipeable, individually readable,
  the correct default. `ChartCard`'s new `contentAccessibilityLabel` prop was
  intentionally _not_ wired into `MuscleVolumeCard.tsx` for exactly this
  reason - doing so would have collapsed these already-correct rows into one
  opaque node, the same class of regression this project's P7/P8 reviews
  fixed in the opposite direction (pulling controls _out_ from under a
  collapsing wrapper, not pushing correct content _into_ one).
- **`StatRangeSelector` and the exercise-progression metric selector** both
  render through the pre-existing, already-audited `SegmentedControl`
  primitive (`accessibilityRole="tablist"`/`"tab"`,
  `accessibilityState.selected`, and a documented `hitSlop.small` compensating
  for its ~36pt native row height to reach the 44pt effective target) - no
  new code in this phase touches that primitive's accessibility behavior.
- **The "View full progression" button** (`app/(tabs)/exercises/[id].tsx`,
  `ProgressChartSlot`) uses the shared `Button` primitive at its default `md`
  size (44pt height, meeting the DoD's touch-target minimum exactly, no
  `hitSlop` needed), with `accessibilityRole="button"` and a real translated
  label (`statistics.exerciseProgression.viewFullButtonLabel`) - a pre-
  existing, already-vetted primitive, unmodified by this phase.
- **Both new screens announce their loading state correctly.**
  `StatisticsScreen.tsx` and `ExerciseProgressionScreen.tsx` both fire
  `AccessibilityInfo.announceForAccessibility(t('common.loading'))` on
  `isPending`, matching `PersonalRecordsScreen.tsx`/
  `ProgressionSettingsScreen.tsx`/`HomeScreen.tsx`'s established pattern -
  confirmed present in both files, not assumed. Per-card loading state (when
  switching range/metric after the first load, i.e. `isFetching` without
  `isPending`) is separately communicated by `ChartCard`'s own pre-existing,
  unmodified `accessibilityLabel={title} accessibilityLiveRegion="polite"`
  skeleton wrapper - a live region rather than a one-shot announcement, the
  correct choice for a state that can flip repeatedly as the user changes the
  range selector, and consistent across every card since it lives in the one
  shared `ChartCard` component rather than being reimplemented per card.
- **No other hardcoded English string slipped into any new `.tsx` file.** A
  grep across every new component/screen file in scope for un-translated
  string literals and `accessibilityLabel="..."` literals found exactly one
  hit - `HeatmapView.tsx`'s (A11Y-P11-002, now fixed) - confirming
  `i18n/catalogs/en.ts`'s new `statistics` block is genuinely used everywhere
  else, not just declared.
- **The yearly heatmap is not interactive.** `grep -n "onPress"` across
  `YearlyHeatmapCard.tsx` and `HeatmapView.tsx` returns nothing - no tap
  handler exists on the grid or any individual day cell, so the roadmap DoD's
  touch-target requirement ("the day-cell heatmap if interactive") does not
  apply; this was confirmed rather than assumed before deciding not to treat
  cell-level touch targets as a gap.
- **`ChartTooltip`/`ChartLegend`**: exported from the `components/charts`
  barrel but not imported or rendered anywhere in this phase's actual UI
  (`grep -rln` across `features/statistics` and `app/(tabs)/stats` for both
  names returns only their own definition/barrel-export files) - both render
  real `Text` content with no interactivity, so there is nothing to audit
  functionally today; noted for awareness only, not a finding, since dead
  code carries no accessibility risk until a future pass wires it up (already
  documented in `ChartTooltip.tsx`'s own comment as a scoped follow-up, per
  this phase's plan decision 8).
- **Thin route wrappers**: `app/(tabs)/stats/index.tsx`,
  `app/(tabs)/stats/exercise/[exerciseId].tsx`, and
  `app/(tabs)/stats/_layout.tsx` contain no screen body (per CLAUDE.md's rule)
  and no accessibility-relevant logic of their own.
- **`ExerciseDetailScreen`'s new `progressChartSlot` composition**
  (`app/(tabs)/exercises/[id].tsx`'s `ProgressChartSlot`) routes every string
  through `t()`, reuses the already-vetted `Button` primitive for its "View
  full progression" action, and renders `ExerciseProgressionCard` unmodified
  from its dedicated-screen usage - the same fix (A11Y-P11-001) that landed
  in `ExerciseProgressionCard.tsx` applies here automatically, with no
  separate slot-specific gap found.
- **Hit target sizing elsewhere**: no ad hoc `hitSlop` override and no new
  small custom control anywhere in `features/statistics`/`components/charts`
  beyond the existing `SegmentedControl`/`Button` primitives already covered
  above - `grep -rn "hitSlop"` across both directories returns zero matches,
  nothing in this phase invents its own target-size handling to get wrong.

---

## Recommendations, priority order

1. **Already fixed in this pass, no action needed**: A11Y-P11-001 (Skia-canvas
   charts had zero accessibility surface - now a real, data-summarizing
   `contentAccessibilityLabel` on `ChartCard`) and A11Y-P11-002 (the heatmap's
   hardcoded, non-data-summarizing label - now translated and real), both
   verified via a real before/after RNTL prop-tree dump.
2. **Legitimate scoped follow-up, not attempted here**: `ChartTooltip`'s own
   doc comment already names wiring it to `victory-native`'s
   `useChartPressState` (a drag/press interaction revealing the exact value
   under the user's finger) as future work; when that lands, it will need its
   own accessibility pass, since a drag-driven tooltip is a new interactive
   surface, not a static label like the ones this review covers.

## Sign-off

This audit finds **no BLOCKING issue** and does not gate this phase's commit
on accessibility grounds. The specific bug class that blocked P7 and P8 (a
`SwipeableRow` cloning its accessibility props onto a multi-control child) is
confirmed absent from this diff by direct evidence (`grep -rn "SwipeableRow"
features/statistics components/charts "app/(tabs)/stats"` returns nothing).
One real, non-blocking HIGH finding was found in this phase's genuinely
central concern - four of five dashboard chart cards had zero non-visual
equivalent of their data, a confirmed silent dead zone rather than a
mislabeling - and one MEDIUM finding (a hardcoded, non-data-summarizing
heatmap label). Both were fixed within this pass: `ChartCard` gained an
opt-in `contentAccessibilityLabel` that collapses otherwise-invisible
canvas/SVG chart content into one meaningful, data-summarizing VoiceOver/
TalkBack stop, deliberately left unwired on `MuscleVolumeCard` so its
already-correct, individually-readable rows are not regressed into the same
collapse shape this project's other reviews have fought to eliminate
elsewhere. Everything else audited - the range/metric selectors, the "View
full progression" button, both screens' loading announcements, i18n coverage,
heatmap interactivity, and hit-target sizing throughout - is correct and
needed no changes.
