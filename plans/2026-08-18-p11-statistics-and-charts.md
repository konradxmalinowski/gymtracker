# P11 - Statistics and charts

Roadmap: `docs/ROADMAP.md` P11. Branch: `feat/p11-statistics-and-charts` (off
`main` at `5834de9`, the merged P10 PR #15).

## Step 0 decisions (user sign-off, 2026-08-18)

1. **Chart bucket sizing per range.** `4w` -> day buckets, `3m` -> week buckets,
   `1y` -> week buckets, `all` -> month buckets. Applies to `volumeByPeriod`,
   `sessionFrequency`, `durationTrend`.
2. **Muscle-group volume grouping.** Coarse `exercise.body_part` (the same
   denormalized column P8 already populates from each exercise's primary
   muscle at catalog-build/custom-create time - not a fresh `exercise_muscle`
   join), primary muscle only, no double counting. A `NULL` `body_part`
   (a custom exercise with no muscle selected) buckets under a synthesized
   `other` slice rather than silently vanishing.
3. **Yearly heatmap metric.** Total working-set volume (kg) per `local_date`,
   quantile-binned into levels 0 (no training) through 4 (top quartile of the
   year's trained days) - GitHub-contribution-graph style.

## Decisions made this session (not requiring separate sign-off)

4. **`StatisticsRepository`'s `weeklySummary()`/`streak()` are not built in
   this phase.** ADR-0019 left their fate as "P11's to act on": keep Home on
   its own `HomeDashboardRepository`, or migrate it onto a real
   `StatisticsRepository`. Neither the roadmap's P11 scope list nor its
   acceptance criteria call for either method on the Statistics tab itself,
   and migrating already-shipped, tested Home code for zero user-visible
   benefit is unwarranted churn. Resolution: Home keeps its own read model
   permanently. `StatisticsRepository` ships with the six methods the
   Statistics tab and the exercise progression screen actually use
   (`volumeByPeriod`, `sessionFrequency`, `durationTrend`, `muscleGroupVolume`,
   `exerciseProgression`, `yearlyHeatmap`) - `weeklySummary`/`streak` are
   removed from ARCHITECTURE.md section 8.3's `StatisticsRepository` listing
   as part of this phase's docs pass, with ADR-0019 updated to record the
   final resolution instead of leaving it open. `docs/ARCHITECTURE.md`
   section 9.1 gains a documented `statistics -> records` edge (reusing
   `estimated1RM`/`isRecordEligibleSetType`/`OneRmFormula` for the `e1rm`
   progression metric - a pure domain-calculator reuse, not a write-service
   dependency, so it doesn't conflict with "statistics depends only on read
   models, never on write services").
5. **Repository methods take concrete `[localDateFrom, localDateTo]` +
   `bucket`, not a `StatRange` enum.** Every other repository in this
   codebase keeps range/settings resolution out of the repository layer
   (`WorkoutSessionService` resolves `timer.defaultRestSeconds` and passes a
   plain number down, never lets the repository read settings). `StatRange ->
[localDateFrom, localDateTo, bucket]` resolution lives in
   `features/statistics/domain/statRange.ts`, called from the hooks layer.
6. **`exerciseProgression`'s raw-to-metric reduction is a pure domain
   function** (`features/statistics/domain/exerciseProgressionReducer.ts`),
   called by the repository after a single indexed SQL fetch of the
   exercise's working sets in range (`ix_set_exercise_time`). Table-driven
   unit tests target the reducer directly; the repository integration test
   covers the SQL fetch + end-to-end wiring. Same split Home already
   established for `StreakCalculator` (repository returns raw dates, a pure
   calculator processes them) - kept in the repository here (not the hook)
   only because `exerciseProgression`'s section 8.3 signature returns the
   already-reduced `SeriesPoint[]`, and duplicating that reduction at every
   call site would be worse than one repository-internal call.
7. **`StackedBarChartView` is custom-drawn (plain RN `View`s), not backed by
   `victory-native`'s `StackedBar`.** `HeatmapView` is already documented in
   ARCHITECTURE.md as "custom, react-native-svg" - not every one of the 8
   adapter files needs to touch Victory internals, only isolate them. Victory
   Native's `StackedBar` needs its stacked keys to be static generic type
   parameters; muscle-group volume's 7-or-fewer `body_part` slices are a
   dynamic runtime list, which does not fit that generic shape without an
   `any` escape hatch this project's Definition of Done forbids. A horizontal
   proportional-width bar row per slice (label, colored bar, kg value,
   percentage) reads better for 7 categories than a single stacked bar anyway.
8. **Chart interactivity trimmed to static rendering for this pass** - no
   drag-to-inspect tooltip gesture. ADR-0010 names gesture-driven tooltips as
   a benefit of the library choice, not something the roadmap's P11
   acceptance criteria require ("every chart has an empty state and a loading
   skeleton; chart colors come from tokens" - both are still delivered in
   full). `ChartTooltip` still exists in the adapter as a static positioned
   label component (used for e.g. "latest point" annotations), satisfying
   ADR-0010's 8-file adapter surface; wiring it to `useChartPressState` is a
   real, scoped follow-up, not attempted half-finished here.
9. **`ExerciseDetailScreen`'s third slot (`progressChartSlot`), tracked empty
   since P4, is filled in this phase** - the CLAUDE.md "Known gaps"-adjacent
   note calling it "genuinely empty pending a future statistics/charting
   phase" names this exact phase. Filled the same way P8 filled the other two
   slots: `app/(tabs)/exercises/[id].tsx` composes `statistics`'s hook/
   component through the slot prop; `exercise-library` stays a
   dependency-free leaf.

## Scope (this phase)

- `features/statistics/repository/{StatisticsRepository.ts,
SqliteStatisticsRepository.ts}` - 6 methods, `deleted_at IS NULL`/
  `status = 'completed'` filtered throughout, every query parameterized.
- `features/statistics/domain/{statRange.ts,dateRangeBuckets.ts,localDate.ts,
exerciseProgressionReducer.ts,yearlyHeatmapBinning.ts}` - pure calculators,
  table-driven/property tests.
- `components/charts/{types.ts,ChartCard.tsx,LineChartView.tsx,
BarChartView.tsx,StackedBarChartView.tsx,HeatmapView.tsx,ChartTooltip.tsx,
ChartLegend.tsx}` - the ADR-0010 adapter, first real implementation (was an
  empty `.gitkeep` skeleton).
- `features/statistics/{hooks,components,screens}` - `useStatisticsDashboard`,
  `useExerciseProgression`; `StatRangeSelector`, `VolumeChartCard`,
  `FrequencyChartCard`, `DurationTrendCard` (beyond section 1871's literal
  list - the roadmap's own "duration trend" acceptance item needs a card),
  `MuscleVolumeCard`, `YearlyHeatmapCard` (same kind of beyond-the-list
  addition, for "yearly activity heatmap"), `ExerciseProgressionCard`;
  `StatisticsScreen`, `ExerciseProgressionScreen`.
- `app/(tabs)/stats/` becomes a real nested Stack navigator
  (`_layout.tsx` + `index.tsx` + `exercise/[exerciseId].tsx`), same P4/P5
  restructure (`app/(tabs)/_layout.tsx`'s tab registration:
  `"stats/index"` -> `"stats"`).
- `services/container.ts` gains `statisticsRepository` (no service - same
  "flat DTOs, nothing to validate" read-model shape as `ExerciseHistoryRepository`/
  `HomeDashboardRepository`).
- `navigation/routes.ts` gains `routes.stats.{dashboard,exercise}`.
- `ExerciseDetailScreen`'s `progressChartSlot` (decision 9).
- i18n strings; benchmark extension for `muscleGroupVolume`/`exerciseProgression`
  against the 75,000-set fixture (`volumeByPeriod`'s underlying aggregate is
  already benchmarked since P2 via `v_working_set`).

## Verification plan

`tsc --noEmit`, `eslint .`, full Jest suite, `npx expo export --platform ios`
(build-verification proxy, same constraint every phase since P4 has flagged -
no simulator/emulator/dev-client in this environment). Security review
(security-agent-sonnet, routine scope) and accessibility review
(general-purpose stand-in, same substitution P7-P10 used) before commit.
Docs updated in the same pass: `CLAUDE.md`, `CHANGELOG.md`,
`docs/ARCHITECTURE.md` (sections 8.3, 9.1, 10.1, component table),
`docs/adr/0019-home-dashboard-read-model.md` (resolution), `docs/ROADMAP.md`
(P11 marked complete alongside the phase commit, matching precedent).
