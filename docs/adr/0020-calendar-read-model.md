# ADR-0020: Calendar's month and year overviews come from a lightweight,
calendar-owned read model, not a call into `workout-logging`

- Status: accepted
- Date: 2026-08-19

## Context

`docs/ARCHITECTURE.md` section 9.1's dependency graph has drawn a `CAL --> WL`
(`calendar --> workout-logging`) edge since before `calendar` existed as anything
more than an empty skeleton directory - the same kind of forward-drawn, aspirational
edge the graph already carried for `STAT --> WL` before P11, and for `HOME --> STAT`/
`HOME --> DG` before P10 resolved those (`docs/adr/0019-home-dashboard-read-model.md`).
P12 (training calendar) is the first phase that actually needs a per-day training
overview: a month grid showing which days were trained, at what volume, and using
which plan day, plus a compact year view for the same data binned into intensity
levels. `workout-logging`'s own `WorkoutSessionRepository`/`WorkoutSessionService`
already expose `listHistory`/`getSession` for other consumers (P9's history list and
detail screens), but neither is shaped for a calendar's actual query pattern - a
month or year's worth of days grouped by `local_date`, not a paginated list of
individual sessions.

## Options considered

**A. Add `listByDateRange`-style methods to `WorkoutSessionRepository`/
`WorkoutSessionService` and have `calendar` call through the service layer, making the
already-drawn `CAL --> WL` edge real.** Matches the graph's original forward-drawn
intent with no deviation to document. Rejected for the same reason ADR-0019 rejected
the equivalent option for `home`: `workout-logging` is already the hub every other
feature depends on for writes, and growing its read surface for every downstream
read-only consumer's own bespoke query shape (a paginated session list for `history`,
a per-day grouped overview for `calendar`, a range-bucketed aggregate for `statistics`)
would turn one aggregate-root repository into a dumping ground for unrelated read
patterns that have nothing to do with the write invariants that repository actually
exists to protect (transactional set/session mutation, `ON DELETE CASCADE`
correctness). It would also mean routing a purely read-only calendar screen through a
service layer built and tested around write orchestration, for no benefit a direct
read model doesn't already provide more simply.

**B. A lightweight, calendar-owned read model - `CalendarRepository` inside
`features/calendar/`, answering exactly the two questions the calendar screens need
(`monthOverview(year, month)`, `yearOverview(year)`), with no service layer, mirroring
`HomeDashboardRepository`'s P10 precedent and `StatisticsRepository`'s P11 one (flat
DTOs, nothing to Zod-validate on a read path).** **Chosen.**

**C. Compute the month/year overview client-side from data another feature already
has loaded (e.g. derive from `listHistory` results the `workout-logging`/`history`
read path already fetches elsewhere).** Rejected for the same reason ADR-0019 rejected
the equivalent option for `home`: it would mean loading many individual sessions'
worth of rows to compute a per-day grouped/binned view, violating this project's
CQRS-lite convention (`docs/ARCHITECTURE.md` section 3) that statistics/history/
calendar reads go through dedicated SQL-aggregated DTOs, never load-all-then-reduce-
in-JS.

## Decision

**Option B.** `features/calendar/repository/{CalendarRepository.ts,
SqliteCalendarRepository.ts}` exposes two methods - `monthOverview(year, month, tx?)`
and `yearOverview(year, tx?)` - both read-only, both parameterized, both filtering
`deleted_at IS NULL`/`status = 'completed'`, neither extending `BaseSqliteRepository`
(nothing here writes, the same reasoning `ExerciseHistoryRepository`,
`HomeDashboardRepository`, and `StatisticsRepository` already used for the same class
of decision). `services/container.ts` gains `calendarRepository` with no matching
service, the ninth feature-repository pair added to `AppContainer`, and the same "read
model, no service" shape `exerciseHistoryRepository`/`homeDashboardRepository`/
`statisticsRepository` already established.

Unlike ADR-0019 (written and decided before `home`'s implementation shipped), this ADR
is written after `CalendarRepository` was fully implemented, benchmarked, and fixed -
so it can record the real, empirical evidence for the decision rather than only the
architectural reasoning. That evidence turned out to matter: the first implementation
of both methods read `v_session_summary` (the pre-existing, already-shared aggregate
view `HomeDashboardRepository` and other read models also use), and both measured over
budget against the project's shared 150ms one-year-range performance bound on the
75,000-set benchmark fixture - `yearOverview` at 195-347ms, `monthOverview` (once the
same root cause was suspected) at ~206-216ms. Root cause: `v_session_summary` is
itself already a `GROUP BY s.id` aggregate view over the *entire* `workout_session`
table, so a caller's own `WHERE local_date BETWEEN ? AND ?` filter never reaches the
view's internal aggregation - SQLite materializes and aggregates the whole fixture
regardless of the requested range, no matter how narrow. This is itself evidence for
option B over option A, not just a bug to route around: `workout-logging`'s
`v_session_summary` view was designed as the shape a paginated session list (`history`)
needs, not the shape a date-range-scoped, per-day-grouped read needs - calling through
`WorkoutSessionService` would not have avoided this cost, since the service has no
narrower query to offer than the same view. The fix that shipped reads the lower-level
`v_working_set` view directly (`yearOverview`, mirroring
`SqliteStatisticsRepository.yearlyHeatmap`'s own already-reviewed query shape) or
`workout_session` directly via a correlated scalar subquery into `v_working_set`
(`monthOverview`, needed because its DTO carries `plan_day_name_snapshot`, data
`v_working_set` does not carry) - both confirmed via `EXPLAIN QUERY PLAN` to use
`ix_session_local_date` and measured at 0-2ms post-fix. See
`plans/2026-08-19-p12-calendar-state.md`'s "Step 2 follow-up" for the full query text,
the two rejected intermediate approaches, and the measured numbers for each.

This is a real, deliberate deviation from `docs/ARCHITECTURE.md` section 9.1's
existing diagram, which still draws `CAL --> WL` as a real edge - the same situation
ADR-0019 resolved for `STAT --> WL`. That diagram edge is not being removed - it is
annotated to point at this ADR, per the precedent ADR-0019 itself established for
`HOME --> STAT`/`HOME --> DG`, and section 8.3's new `CalendarRepository` entry
cross-references this ADR directly.

## Consequences

Positive:

- `calendar` ships on its own phase with a complete, self-contained data layer, the
  same way P8's `records`, P10's `home`, and P11's `statistics` each did - no other
  feature directory (`workout-logging` in particular) is grown or reshaped to make
  this possible.
- `CalendarRepository`'s contract is small (two methods) and fully scoped to what
  `CalendarScreen.tsx` actually renders, so there is no speculative surface to
  maintain ahead of a real caller - consistent with this project's "never create
  placeholder code" rule.
- The performance investigation happened *inside* this phase, against a real
  benchmark, rather than being discovered later against production data - the
  75,000-set fixture and the shared 150ms budget existed specifically to catch this
  class of regression before it ships, and did.
- Both methods are now cheap, indexed reads (`ix_session_local_date` backs both, the
  same partial index `HomeDashboardRepository`/`WorkoutHistoryListScreen` already
  rely on) - no new index or schema change was needed to fix the regression, only a
  different query shape.

Negative:

- **Duplication risk with `statistics`, the same risk class ADR-0019 flagged for
  `home`.** `calendar`'s `computeDayIntensities`/`generateMonthGrid` binning math is a
  deliberate transcription of `statistics`' `yearlyHeatmapBinning.ts`, and nothing
  forces the two to stay in agreement if either is ever changed independently. Unlike
  ADR-0019's migration note (which named a real future resolution path for `home`),
  no equivalent migration path is proposed here: `calendar`'s month grid and
  `statistics`' yearly heatmap serve genuinely different UI shapes (a full month grid
  with plan-day labels vs. a year-long GitHub-style contribution graph), so unifying
  them into one shared repository method would trade a small, contained duplication
  for a real cross-feature dependency neither feature currently needs.
- The correlated-scalar-subquery shape `monthOverview` ships with is less obviously
  simple to a future reader than a plain `LEFT JOIN ... GROUP BY` would have been -
  its own file's code comments and this ADR exist specifically so the non-obvious
  "why not the simpler join" reasoning isn't lost the next time someone touches this
  query.

## Migration note

Unlike ADR-0019, this ADR opens with no unresolved migration question: `calendar`
keeps its own `CalendarRepository` permanently, by the same reasoning ADR-0019's own
P11 resolution section landed on for `home` - neither `docs/ROADMAP.md`'s P12 scope
nor its acceptance criteria call for `calendar`'s per-day overview to be served by
`StatisticsRepository`, and the two features' query shapes (day-grouped-with-plan-
labels vs. range-bucketed-aggregate) are different enough that forcing one repository
to serve both would not actually remove real duplication, only relocate it.
