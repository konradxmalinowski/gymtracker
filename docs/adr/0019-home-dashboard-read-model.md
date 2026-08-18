# ADR-0019: Home's streak and weekly-summary data come from a lightweight, home-owned read model, not `StatisticsRepository`

- Status: accepted
- Date: 2026-08-18

## Context

`docs/ARCHITECTURE.md` section 8.3 has named `StatisticsRepository.streak()` and
`StatisticsRepository.weeklySummary(localDateFrom, localDateTo)` since that section was
first written - both DTO-returning, read-only methods, part of the same
`statistics`-feature repository as `volumeByPeriod`/`sessionFrequency`/
`muscleGroupVolume`/`exerciseProgression`/`yearlyHeatmap`. P10 (home dashboard) is the
first phase that actually needs a streak number and a weekly-summary tile, on Home's
own `StreakCard`/`WeeklySummaryCard`. `statistics` itself is `docs/ROADMAP.md`'s P11 -
still an empty skeleton directory (`components/hooks/screens/services/domain/
repository/types/index.ts`, no implementation) at the time P10 was built. Shipping
Home's two data needs therefore requires either building enough of `StatisticsRepository`
to host two of its eight planned methods a full phase ahead of the rest, or finding
another way to get the same two numbers.

## Options considered

**A. Pull `StatisticsRepository` forward and implement `streak()`/`weeklySummary()`
now, leaving its other six methods (`volumeByPeriod`, `sessionFrequency`,
`durationTrend`, `muscleGroupVolume`, `exerciseProgression`, `yearlyHeatmap`) unbuilt
until P11.** Matches section 8.3's original plan exactly - no deviation to document.
Rejected: it starts a feature directory a full phase early with two-eighths of its
contract implemented and the rest stubbed, which is exactly the "empty skeleton ahead
of its own phase" shape every other not-yet-built feature in this codebase
(`body-metrics`, `calendar`, `data-transfer`, `daily-goals`) deliberately avoids. It
also means P11's own kickoff has to reconcile a repository that already exists in a
partial state, rather than starting clean the way P4-P10 each started their own
feature directory.

**B. A lightweight, home-owned read model - a `HomeDashboardRepository` inside
`features/home/` that answers exactly the two questions Home needs (`getTrainingLocalDates`
for the streak calculator, `getWeeklySummary` as a single-table SQL aggregate), with no
service layer, mirroring `ExerciseHistoryRepository`'s P8 precedent (flat DTOs, nothing
to Zod-validate on a read path).** **Chosen.**

**C. Compute the streak and weekly summary client-side from data Home already has
loaded elsewhere (e.g. derive from `listHistory` results already cached by the history
feature).** Rejected: it would mean loading many sessions' worth of rows just to
compute two numbers, violating this project's CQRS-lite convention (`docs/ARCHITECTURE.md`
section 3) that statistics/history reads go through dedicated SQL-aggregated DTOs, never
load-all-then-sum-in-JS. `getWeeklySummary` in particular needs to stay a single-table
`SUM`/`COUNT` aggregate over `workout_session`'s already-denormalized totals, not a
scan-and-reduce over individual sets.

## Decision

**Option B.** `features/home/repository/{HomeDashboardRepository.ts,
SqliteHomeDashboardRepository.ts}` exposes four methods - `getTrainingLocalDates`,
`getWeeklySummary`, `getLastCompletedSession`, `getMostRecentCompletedPlanDayId` - all
read-only, all parameterized, all filtering `deleted_at IS NULL`, none extending
`BaseSqliteRepository` (nothing here writes, so there is no id-generation/
audit-stamping/soft-delete lifecycle to inherit - the same reasoning
`ExerciseHistoryRepository` and `PersonalRecordRepository` already used for the same
class of decision). `getTrainingLocalDates` feeds `features/home/domain/
StreakCalculator.ts`'s pure `calculateStreak` function; `getWeeklySummary` is a single
SQL aggregate over `workout_session` (every source column - `total_volume_kg`,
`total_sets`, `duration_seconds` - is already denormalized on `finish()`, so this needs
no join to `workout_set`). `services/container.ts` gains `homeDashboardRepository` with
no matching service, the seventh feature-repository pair added to `AppContainer`, and
the same "read model, no service" shape `exerciseHistoryRepository` already
established.

This is a real, deliberate deviation from `docs/ARCHITECTURE.md` section 8.3's existing
table, which still lists `streak()`/`weeklySummary()` as `StatisticsRepository` methods.
That table is not being edited to remove them - a future `StatisticsRepository` may
still want its own version of both, for surfaces `home` does not serve (a full
statistics dashboard's own streak display, a stats-tab weekly chart with drill-down).
Section 8.3 is annotated to point at this ADR rather than silently rewritten.

## Consequences

Positive:

- `home` ships on its own phase with a complete, self-contained data layer, the same
  way P8's `records` and P9's history extensions did - no other feature directory is
  left in a half-built state to make this possible.
- `HomeDashboardRepository`'s contract is small (four methods) and fully scoped to what
  `HomeScreen.tsx` actually renders, so there is no speculative surface to maintain
  ahead of a real caller - consistent with this project's "never create placeholder
  code" rule.
- `getWeeklySummary` and `getTrainingLocalDates` are both cheap, indexed reads
  (`ix_session_local_date` backs both) - no new index or schema change was needed to
  support either.

Negative:

- **Duplication risk with P11.** Once `StatisticsRepository` is built, it will very
  plausibly want a `streak()`/`weeklySummary()` of its own for the stats tab, and
  nothing forces that implementation to agree with `HomeDashboardRepository`'s. Two
  independently-evolving definitions of "the current streak" is a real risk if they
  ever diverge (different lookback windows, different grace-rule interpretation). The
  migration note below is the mitigation.
- Section 8.3's `StatisticsRepository` table now describes two methods that, as of this
  ADR, are not actually the ones backing Home - a reader of that section alone would
  not know `home` gets its streak from somewhere else without also reading this ADR.
  Mitigated by cross-referencing this ADR from section 8.3 directly, not just from
  `CLAUDE.md`.

## Migration note for P11

When `statistics` moves from an empty skeleton to a real phase, choose one of two
paths rather than silently doing nothing:

1. **Keep `home` on its own read model permanently.** `HomeDashboardRepository` stays
   as it is; `StatisticsRepository.streak()`/`weeklySummary()`, if built at all, are a
   separate implementation serving the stats tab's own needs (which may reasonably
   want different parameters - a chosen date range rather than always "this calendar
   week", for instance). Cheapest, but accepts the duplication risk above
   indefinitely.
2. **Migrate `useHomeDashboard.ts`'s two repository calls onto the real
   `StatisticsRepository`** once it exists, deleting `getTrainingLocalDates`/
   `getWeeklySummary` from `HomeDashboardRepository` (its other two methods,
   `getLastCompletedSession`/`getMostRecentCompletedPlanDayId`, are not part of
   section 8.3's `StatisticsRepository` table at all and would stay on `home`
   regardless). Removes the duplication risk, at the cost of `home` gaining a real
   dependency on `statistics` - a dependency direction `docs/ARCHITECTURE.md` section
   9.1's diagram already anticipates (`HOME --> STAT`), even though this ADR is the
   reason that edge is not yet exercised in code.

Either choice is acceptable; not choosing - leaving both repositories answering the
same question with no cross-reference - is the outcome this note exists to prevent.

## P11 resolution (2026-08-18)

**Path 1, chosen: `home` keeps its own read model permanently.**
`StatisticsRepository` (`features/statistics/repository/StatisticsRepository.ts`)
ships with six methods - `volumeByPeriod`, `sessionFrequency`, `durationTrend`,
`muscleGroupVolume`, `exerciseProgression`, `yearlyHeatmap` - and deliberately does
**not** implement `streak()`/`weeklySummary()` at all, on either signature. Reasoning:

- Neither `docs/ROADMAP.md`'s P11 scope list nor its acceptance criteria call for a
  streak or weekly-summary surface on the Statistics tab itself - the roadmap names
  "volume over time, workout frequency, duration trend, muscle-group volume breakdown,
  yearly activity heatmap; per-exercise progression screen; the exercise detail
  progress chart," nothing else.
- Path 2 (migrate `useHomeDashboard.ts` onto `StatisticsRepository`) would touch
  already-shipped, already-tested P10 code (`HomeScreen.tsx`, `useHomeDashboard.ts`,
  `StreakCard.tsx`, `WeeklySummaryCard.tsx`, their test suites) for zero user-visible
  benefit - the dashboard renders identically either way. That is real regression risk
  taken on for a purely internal refactor, which this ADR's own "negative consequence"
  section already named as a real but non-blocking risk, not an emergency to resolve
  the moment P11 starts.
- The duplication risk this ADR flagged does not materialize: since
  `StatisticsRepository` never defines its own `streak()`/`weeklySummary()`, there are
  not two independently-evolving definitions of "the current streak" - there remains
  exactly one, `StreakCalculator.calculateStreak` via `HomeDashboardRepository`.

This closes this ADR's own open migration note. `docs/ARCHITECTURE.md` section 8.3's
`StatisticsRepository` entry is updated in the same pass to list the six shipped
methods only, with `streak()`/`weeklySummary()` removed from its signature list and a
note pointing here rather than left dangling as aspirational, unbuilt methods. Section
9.1's `HOME --> STAT` diagram edge is confirmed to remain unexercised in code, same as
this ADR always anticipated - `home` depends on `workout-logging`, `plans`, and
`records` only, never `statistics`.

A real, separate `statistics -> records` edge was added instead, unrelated to this
ADR's own subject: `exerciseProgression`'s `e1rm` metric reuses
`estimated1RM`/`isRecordEligibleSetType` from `records`' domain layer (a pure
calculator reuse, not a write-service dependency - see `docs/ARCHITECTURE.md` section
9.1's own updated note on this edge).
