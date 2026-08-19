# P12 - Training calendar - live state

Last updated: 2026-08-19 (Steps 1-7 done. Step 7 (docs-agent) landed CLAUDE.md,
docs/ARCHITECTURE.md, docs/ROADMAP.md, docs/adr/0020-calendar-read-model.md, and
docs/architecture-snapshot.md, plus the one permitted trivial doc-comment fix on
`features/calendar/domain/monthGrid.ts`; dispatching step 8)

## Current step

Steps 1-7 done. Step 8 (git-commit-agent) is next.

## Per-agent dispatch status

| Step | Agent | Status | Summary |
|---|---|---|---|
| 1 | backend-agent-sonnet | done | domain calculators + `CalendarRepository` interface/DTOs landed 2026-08-19; `tsc --noEmit`, `eslint`, `prettier --check` all clean on the new files |
| 2 | database-agent | done, with a follow-up fix | `SqliteCalendarRepository` landed 2026-08-19 + `calendarRepository` wiring in `services/container.ts`; original pass clean on `tsc`/`eslint`/`prettier`. A coordinator-directed follow-up (below, "Step 2 follow-up") then fixed a real perf regression test-agent's own benchmark caught in step 4: `yearOverview` measured 195-347ms against the 75,000-set fixture (budget 150ms) because it read the unindexed-for-this-purpose `v_session_summary` aggregate view; `monthOverview` had the same latent issue, unbenchmarked but confirmed by manual timing (~206-216ms). Both rewritten to avoid `v_session_summary` entirely; both now measure 0-2ms. |
| 3 | frontend-agent | done | hooks/components/screens/navigation landed 2026-08-19; `tsc --noEmit`, `eslint .` (repo-wide), `prettier --check`, `expo export --platform ios` all clean |
| 4 | test-agent | done (findings below - 1 fixed by a concurrent agent, 1 documentation gap not fixed, 1 flaky-test root cause found and resolved in the test itself) | domain/repository/component/screen tests + benchmark landed 2026-08-19: 9 suites, 88 tests, all passing; `tsc --noEmit`, `eslint`, `prettier --check` clean; full suite re-run multiple times across this step (including twice back to back at the very end) with no regressions - reconciled at 144 suites, 1317 passed, 1 pre-existing skip (135/1228 P11 baseline + this step's own 9 suites/89 tests exactly) |
| 5 | security-agent-sonnet | done | routine SQL review, `reports/security-2026-08-19-p12.md`: 0 critical/high/medium/low, 3 informational notes. Nothing blocks commit. |
| 6 | accessibility-agent | done (ran concurrently with step 4; two regression tests requested back, now added - see below) | UI accessibility review landed 2026-08-19, `reports/accessibility-2026-08-19-p12.md`: fixed A11Y-P12-001 (`CalendarMonth.tsx` weekday header collapse) and A11Y-P12-002 (`CalendarScreen.tsx` missing year-empty announcement) directly, did not touch `__tests__/` since test-agent was concurrently working there, asked for the two regression tests to be added once free. No BLOCKING finding. |
| 7 | docs-agent | done | CLAUDE.md (P12 status paragraphs matching P10/P11 depth, opening summary line, module-dependency-graph bullet, "Thirteen features total" list), `docs/ARCHITECTURE.md` (section 8.3 `CalendarRepository` entry, section 9.1 `CAL --> WL` resolution paragraph, section 10.1 confirmed accurate/unchanged, section 12.1 query-key table note), `docs/ROADMAP.md` (P12 marked complete), `docs/adr/0020-calendar-read-model.md` (new), `docs/architecture-snapshot.md` (Status paragraph, composition-root pair count, suite-size-by-phase line, snapshot_commit note). Also fixed `features/calendar/domain/monthGrid.ts`'s doc-comment gap (logic untouched) as the one permitted trivial doc fix. |
| 8 | git-commit-agent | queued | split commits |

### Step 4 (test-agent)

Nine new suites under `__tests__/features/calendar/**`, plus one new case in
`__tests__/database/benchmarks.perf.test.ts`:

- `domain/localDate.test.ts` (30 tests) - fast-check property tests for
  `endOfMonth` (December rollover, leap/non-leap February), `addMonthsToLocalDate`
  (day-of-month clamping both directions, a full-year round trip),
  `startOfIsoWeek`, `generateDateRange` (inclusive-both-ends, correct length),
  `isSameYearMonth`, mirroring `features/statistics/domain/localDate.test.ts`'s
  own structure/depth per the brief.
- `domain/monthGrid.test.ts` (8 tests) - see "Real bug found, not fixed" below;
  covers gap-free/ascending cells, every day of the target month present exactly
  once, leading/trailing cells marked `isCurrentMonth: false`, a known 6-week
  month (August 2026) and a known 5-week month (February 2026).
- `domain/intensityBinning.test.ts` (8 tests) - property tests mirroring
  `yearlyHeatmapBinning.test.ts`: an absent day is always level 0, a day present
  in `rows` with `totalVolumeKg <= 0` is level 0, highest/lowest trained-day
  volumes bin to level 4/1 respectively (property, not one example), fewer than
  4 trained days still bins every trained day to >= 1.
- `repository/SqliteCalendarRepository.test.ts` (16 tests) - real
  `NodeSqlExecutor` integration tests against `schema.sql`, mirroring
  `SqliteStatisticsRepository.test.ts`'s real-working-set fixture pattern (a
  bare `insertWorkoutSession.totalVolumeKg` override does **not** feed
  `v_session_summary`, which derives volume from a real `SUM(vs.volume_kg)`
  join through `v_working_set` - a real `workout_set` row is required). Covers
  `monthOverview` (several different days, same-day aggregation with
  index-aligned `sessionIds`/`planDayNames` and summed volume, excludes
  soft-deleted/in-progress/discarded sessions, month-boundary scoping) and
  `yearOverview` (one row per trained day, `HAVING SUM > 0` excludes a
  zero-volume day, year-boundary scoping excludes adjacent-year Dec 31/Jan 1).
- `components/CalendarDayCell.test.tsx` (9 tests), `CalendarMonth.test.tsx`
  (4 tests), `CalendarLegend.test.tsx` (2 tests), `CalendarDaySessionPicker.test.tsx`
  (3 tests) - RNTL mounts. `buildCalendarDayAccessibilityLabel`'s branches
  (untrained/outside-month/single-with-plan/single-no-plan/multiple-sessions)
  tested directly against the exported function per its own doc comment.
- `screens/CalendarScreen.test.tsx` (5 tests) - real container
  (`createContainer(createTestDatabase())`, the `PlanDayPickerScreen.test.tsx`/
  `HomeScreen.test.tsx` pattern, not a mocked repository) since the scenarios
  needed (empty-month state, single- vs multi-session day tap) depend on real
  `v_session_summary` data, not just hook composition: empty-month state
  renders (announced) alongside the always-present grid, a single-session day
  tap `router.push`es straight to `history.detail`, a multi-session day tap
  opens the `CalendarDaySessionPicker` sheet instead.
- `__tests__/database/benchmarks.perf.test.ts`: one new case,
  `calendar repository (P12) > aggregates one year of trained days under
  budget`, calling the real `SqliteCalendarRepository.yearOverview` against
  the existing 75,000-set fixture with the same `< 150ms` bound P11's
  `muscleGroupVolume`/`exerciseProgression` cases use. **Failed on first
  landing (finding 1 below), now passes** - database-agent's same-phase
  follow-up fixed the underlying query; re-verified passing in the final full
  suite run.

**Post-hoc accessibility-review follow-up (2026-08-19, same phase):** the
accessibility review (step 6) ran concurrently with this step, found and
fixed two real issues directly in `features/calendar/components/CalendarMonth.tsx`
(A11Y-P12-001) and `features/calendar/screens/CalendarScreen.tsx`
(A11Y-P12-002), but was explicitly told not to touch `__tests__/` while this
step was concurrently active there - it asked for two regression tests once
this step was free. Both added:

- `__tests__/features/calendar/components/CalendarMonth.test.tsx` - new test
  "collapses the weekday header row into one accessible summary node
  (A11Y-P12-001 regression)": asserts the header container (found via
  `getByLabelText('Days of the week, Monday through Sunday')`) carries
  `accessible: true`, and that the individual `"Mon"` `Text` node carries no
  `accessible`/`accessibilityRole`/`accessibilityLabel` of its own (RNTL's
  static prop-tree inspection can't simulate the native accessibility
  engine's actual subtree collapsing - the same caveat this codebase's other
  `SwipeableRow`-collapse findings already document in `CLAUDE.md`'s "Known
  gaps" - so this is the closest RNTL-checkable proxy for "collapsed," not a
  device-verified claim).
- `__tests__/features/calendar/screens/CalendarScreen.test.tsx` - new test
  "announces the year-empty title when switching to Year view on an empty
  calendar (A11Y-P12-002 regression)": mounts with a fake `CalendarRepository`
  (`monthOverview`/`yearOverview` both resolving `[]`, mirroring
  `StatisticsScreen.test.tsx`'s `buildFakeStatisticsRepository` pattern
  rather than a real container/fixture, since both queries need to be
  deterministically empty with no session-seeding involved), waits for the
  month-empty state, clears the accessibility-announce spy, switches to
  "Year" via the `calendar-view-selector` `SegmentedControl`, waits for
  `calendar-year-heatmap-card-empty` to render, and asserts the spy was
  called with `"No training yet"` (`calendar.yearHeatmap.emptyTitle`).

Both pass on first run and on repeat runs; suite re-verified clean after
(`tsc --noEmit`/`eslint`/`prettier --check`/full suite - see bottom of this
section for the final numbers).

**Findings from this step, and how each was resolved:**

1. **[RESOLVED by a concurrent agent, not by this step - see "Step 2
   follow-up" below for the accurate final shape] `SqliteCalendarRepository.yearOverview()`
   exceeded its own 150ms benchmark budget on the 75,000-set fixture -
   measured consistently at 195-347ms across repeated runs on first landing,
   not a one-off fluke.** Root cause as originally diagnosed: `yearOverview`
   read `v_session_summary` (itself already a `GROUP BY s.id` aggregate view)
   rather than `v_working_set` directly, so SQLite aggregated the whole
   10-year fixture regardless of the requested year. `yearOverview` now
   reads `v_working_set` directly (mirroring
   `SqliteStatisticsRepository.yearlyHeatmap`) - that part of this finding's
   original description held up. `monthOverview`'s fix does **not** match
   what an earlier draft of this note said, though: reading
   `workout_session.total_volume_kg` directly was tried first and abandoned
   - it broke every non-zero-volume case in this very test file, because
   `insertWorkoutSession` never populates that denormalized column (see this
   file's own `seedTrainedSession` doc comment, lines 19-30), so it isn't a
   safe read for a session constructed outside the real `finish()` path.
   `monthOverview`'s actual, shipped fix is a **correlated scalar subquery**
   into `v_working_set` per session row - see "Step 2 follow-up" below for
   the full shape, the two approaches that were tried and rejected first,
   and the measured numbers for each. Both methods' benchmark/timing checks
   now pass (re-verified in the final full-suite run below). This step's own
   repository tests needed no fix at all in the end - the shipped
   `monthOverview` query derives volume live from real `workout_set` rows,
   exactly what this suite's fixtures already produce, so finding 3 below
   (a same-day ordering flake) is the only test-side change this step
   actually needed.

2. **[Found, still not fixed - documentation-only, non-blocking]
   `generateMonthGrid`'s own doc comment ("always... 5 or 6 [weeks], i.e. 35
   or 42 cells") is incomplete - a non-leap February whose 1st falls on a
   Monday (e.g. 1993-02, confirmed via `new Date(Date.UTC(1993,1,1)).getUTCDay()
   === 1`) needs zero leading and zero trailing filler days, producing an
   exact 4-week, 28-cell grid.** Found by the property test the task brief
   itself specified ("always a whole number of full weeks (35 or 42 cells)");
   the actual code is not wrong or broken - a 4-week grid is a valid,
   gap-free, correctly-ordered Monday-anchored grid, and `CalendarMonth`/
   `CalendarDayCell` render it with no issue - only the *documented* invariant
   is incomplete. Not fixed (the doc comment lives in `features/calendar/
domain/monthGrid.ts`, off-limits per this task's Forbidden section); the test
   suite's own property test was corrected to assert the true invariant
   ("4 to 6 Monday-anchored weeks, i.e. 28-42 cells, divisible by 7") plus a
   named regression test pinning the 1993-02 case, rather than silently
   loosened or deleted. Whoever owns `features/calendar/domain/monthGrid.ts`
   next should decide whether to fix the doc comment (cheap) or reconsider
   whether the grid should always pad to a minimum of 5 weeks for visual
   calendar-app consistency (a product decision, not this agent's to make).

3. **[Found, root cause is a real (minor) production gap, resolved by
   making the test order-independent rather than by touching the repository]
   `SqliteCalendarRepository.monthOverview()`'s post-fix query
   (`ORDER BY local_date ASC` only, from finding 1's fix) has no secondary
   tiebreaker for two sessions sharing the same `local_date`, so the order
   `sessionIds`/`planDayNames` come back in for a same-day multi-session
   entry is SQL-implementation-defined, not guaranteed.** Surfaced as a real,
   intermittent test failure: a first-draft version of the "aggregates two
   sessions on the same day" repository test asserted a specific
   `[morningId, eveningId]` order and failed once in ~10 runs with the order
   reversed, then passed consistently for the next 10+ runs - a genuine
   query-plan-dependent flake, not a code change, matching this agent's own
   flaky-test root-cause protocol rather than something to retry past.
   Reworked the test to verify the actually-documented invariant (every
   `sessionIds[i]` pairs with the correct `planDayNames[i]`, via a `Map`
   keyed by session id) independent of which order the two sessions come
   back in - the repository's own `CalendarDayDto` doc comment never
   promised a same-day ordering, so asserting one was over-specifying the
   contract. Verified stable across 6+ repeat runs after the rework. Not
   fixed at the repository level (off-limits, and arguably not "broken" -
   `CalendarDaySessionPicker`'s row order for a rare same-day-multi-session
   cell may look slightly inconsistent between loads, a minor UX polish item
   rather than a correctness bug); if picker-row order ever needs to be
   deterministic (e.g. chronological, "Morning" before "Evening"), the fix is
   a secondary `ORDER BY started_at ASC` (or similar) added to `monthOverview`'s
   query, next time `features/calendar/` is in scope for someone.

**Final verification (after the accessibility-review follow-up and the
same-day-ordering test fix, re-run twice to confirm stability):**
`npx tsc --noEmit` clean; `npx eslint __tests__/features/calendar` clean (0
errors, 1 pre-existing-class `no-require-imports` warning in
`CalendarScreen.test.tsx`, the same class every prior phase's own screen
tests already have); `npx prettier --check` clean; full suite, run twice
back to back with identical results: **144 suites, 1317 passed, 1
pre-existing skip, 0 failed** - up from the pre-P12 135/1228 baseline by
exactly 9 new suites (the calendar feature's own 9 - no new suite file for
the benchmark case, which landed inside the pre-existing
`benchmarks.perf.test.ts`) and exactly 89 new tests (88 across the 9
calendar suites + 1 new benchmark case; 135+9=144 and 1228+89=1317 both
check out exactly). An earlier run in this same session briefly showed
145/1318 - one suite/test higher than this reconciled, twice-repeated count
- almost certainly a transient artifact of another concurrently-active
agent's own scratch file existing on disk at that exact moment (this
session touched no debug/scratch test files of its own by the time of this
final check, confirmed via `find __tests__ -iname "*debug*"` -> no
matches); 144/1317 is the number that arithmetically reconciles against the
P11 baseline and is treated as authoritative.

## Files changed so far

- `features/calendar/domain/localDate.ts` (new) - calendar-math primitives,
  a deliberate duplication of `features/statistics/domain/localDate.ts`
  (which itself duplicates `home`'s `StreakCalculator.ts`) plus four
  additions that file never needed: `endOfMonth`, `addMonthsToLocalDate`,
  `isSameYearMonth`, `generateDateRange`.
- `features/calendar/domain/monthGrid.ts` (new) - `generateMonthGrid(year,
  month)`, a gap-free Monday-anchored full-week grid (`CalendarDayCell[]`),
  following `dateRangeBuckets.ts`'s "gap-fill in JS over already-day-level
  data, never a second hand-written SQL date-bucket expression" precedent.
- `features/calendar/domain/intensityBinning.ts` (new) -
  `computeDayIntensities(rows, allLocalDates)`, a deliberate duplication of
  `yearlyHeatmapBinning.ts`'s quartile math, generalized to take an explicit
  date list instead of a hardcoded `year` so one function serves both the
  month and year views (see file header for the reasoning).
- `features/calendar/repository/CalendarRepository.ts` (new) - the
  `CalendarRepository` interface (`monthOverview(year, month)`,
  `yearOverview(year)`) plus `CalendarDayDto`/`CalendarYearDayDto`, matching
  the plan's fixed API contract verbatim. `month` is 1-12 throughout (not
  0-indexed) - matches this feature's own `domain/` convention.
  `SqliteCalendarRepository.ts` was deliberately NOT created (not even as a
  stub) - nothing in this step's own files requires it to exist for
  compilation, and creating an empty file risked colliding with
  database-agent's step 2 work; database-agent creates it fresh against this
  interface.
- `features/calendar/index.ts` (modified) - barrel now exports the domain
  calculators and repository interface/DTOs (low-level `domain/localDate.ts`
  primitives deliberately NOT re-exported, matching `home`'s/`statistics`'
  own barrel precedent - they stay internal to this feature).

No files outside `features/calendar/` were touched by this step.

### Step 2 (database-agent)

- `features/calendar/repository/SqliteCalendarRepository.ts` (new) -
  implements `CalendarRepository` verbatim against the interface step 1 left
  behind, no interface/DTO changes. Both methods take only `db` (mirroring
  `SqliteHomeDashboardRepository`/`SqliteStatisticsRepository` - read-only,
  no `BaseSqliteRepository`), read `v_session_summary` only, and accept the
  same optional trailing `tx?: SqlExecutor` every other repository method in
  this codebase does.
  - `monthOverview(year, month, tx)`: computes `[monthStart, endOfMonth(monthStart)]`
    via this feature's own `domain/localDate.ts` `endOfMonth` (reused, not
    duplicated - it already lived in this feature from step 1), selects every
    `v_session_summary` row in that range ordered by `local_date` ASC, then
    groups rows into one `CalendarDayDto` per day with a `Map`-based JS
    reduce (`groupSessionRowsByDay`) - `Map` insertion order preserves the
    query's own ascending `ORDER BY`, so no separate sort is needed. JS
    grouping (not SQL `GROUP BY`) was necessary here because the DTO needs
    index-aligned per-session arrays (`sessionIds`/`planDayNames`), which
    plain SQL aggregation can't produce without a fragile
    `group_concat`-and-split hack.
  - `yearOverview(year, tx)`: a real SQL `GROUP BY local_date` with
    `HAVING SUM(total_volume_kg) > 0` (no JS aggregation needed here, since
    the DTO is just a per-day sum) - the same `[year-01-01, year-12-31]`
    bound style `SqliteStatisticsRepository.yearlyHeatmap` already uses one
    call away.
  - Every parameter is bound (`?`), no string interpolation of `year`/`month`
    into SQL text.
- `services/container.ts` (modified) - added `calendarRepository:
CalendarRepository` to `AppContainer` and its construction
  (`new SqliteCalendarRepository({ db })`), the ninth feature-repository
  pair, placed immediately after `statisticsRepository` (thematic ordering:
  read-model repositories grouped together, in phase order). One deliberate
  deviation from the task brief's literal wording: `SqliteCalendarRepository`/
  `CalendarRepository` are imported by direct file path
  (`@/features/calendar/repository/SqliteCalendarRepository`,
  `.../CalendarRepository`), not through the `features/calendar` barrel -
  matching this file's own established pattern for every other Sqlite
  repository class (`SqliteHomeDashboardRepository`,
  `SqliteStatisticsRepository`, etc. are all imported the same direct way)
  and required regardless, since `features/calendar/index.ts`'s own header
  comment explicitly states the Sqlite implementation class is never
  barrel-exported (the same rule every other feature's barrel already
  follows in this codebase).
- `tsc --noEmit`, `eslint features/calendar/ services/container.ts`, and
  `prettier --check` (after one `prettier --write services/container.ts` for
  a spacing fix Prettier itself applied) all clean.

No schema/migration change - reads the existing `v_session_summary` view
only, as scoped. No tests, hooks, or UI written this step (test-agent/
frontend-agent's jobs later in the sequence).

**Superseded by the follow-up fix directly below**: both queries described
above read `v_session_summary`, which turned out to be the source of a real
perf regression test-agent's benchmark caught in step 4. Neither query
above is what ships - see "Step 2 follow-up" for the final SQL.

### Step 2 follow-up (database-agent, perf-regression fix - 2026-08-19)

Dispatched by the coordinator after test-agent's step-4 benchmark
(`__tests__/database/benchmarks.perf.test.ts`'s `calendar repository (P12)`
case) failed: `yearOverview` measured 195-347ms against the 75,000-set
fixture, over the shared 150ms one-year-range budget. Root cause (test-agent's
own diagnosis, confirmed): `v_session_summary` is itself already a
`GROUP BY s.id` aggregate view over the *entire* `workout_session` table: it
has no way to know about a caller's `WHERE local_date BETWEEN ? AND ?` until
after that aggregation already ran, so SQLite's planner materializes/
aggregates the whole fixture on every call regardless of the requested
range. Confirmed the same defect also affected `monthOverview` (not
separately benchmarked by test-agent, since a one-month range "looked" cheap)
via a manual timing script against the same fixture: ~206-216ms, essentially
identical to `yearOverview`'s slowness - the view's plan doesn't get cheaper
with a narrower caller-side range, because the range filter never reaches
the view's own internal aggregation. Both methods needed a fix, not just the
one the benchmark happened to catch.

**`yearOverview`** - straightforward: read `v_working_set` directly instead
of `v_session_summary`, the exact query shape
`SqliteStatisticsRepository.yearlyHeatmap` already uses one call away:

```sql
SELECT local_date, SUM(volume_kg) AS volume_kg
FROM v_working_set
WHERE local_date BETWEEN ? AND ?
GROUP BY local_date
HAVING SUM(volume_kg) > 0
ORDER BY local_date ASC
```

Measured post-fix: 1-2ms on the fixture (down from 195-347ms). Confirmed via
the real benchmark test, now passing.

**`monthOverview`** - not a drop-in swap to `v_working_set`, because its DTO
needs per-session `plan_day_name_snapshot`, data that lives only on
`workout_session` (`v_working_set` is a per-working-set, not per-session,
view). Two approaches were tried and measured before landing on the one that
shipped:

1. *Rejected: `workout_session.total_volume_kg` directly.* That column is a
   real, denormalized `finish()`-time snapshot and would have been the
   cheapest possible read (no aggregation at all) - but this feature's own
   repository test fixtures (`insertWorkoutSession` in
   `__tests__/database/helpers/fixtures.ts`, and every
   `SqliteCalendarRepository.test.ts` case built on it, written by test-agent
   in step 4) construct a `completed` session row directly, without going
   through `finish()`, so that column is never populated in those tests.
   Verified by running the existing suite against this candidate: 2 of 16
   tests failed with `totalVolumeKg: 0` where a real volume was expected.
   Rejected rather than asking test-agent to rewrite its fixtures to match,
   since the live-volume convention (`yearOverview`, `SqliteStatisticsRepository`,
   every other read-model repository in this codebase) is the one worth
   keeping consistent, not the shortcut.
2. *Rejected: `LEFT JOIN v_working_set ON vws.session_id = ws.id`,
   `GROUP BY ws.id`.* Structurally the same computation
   `v_session_summary`'s own view definition does, just written directly
   against the driving `workout_session` table instead of through the
   pre-built view - the fix `services/container.ts`'s task brief had
   suggested as the likely shape. Measured against the fixture: ~145-155ms,
   barely inside the 150ms budget and failing it on some runs - not a real
   fix. `EXPLAIN QUERY PLAN` showed why: SQLite chose to `MATERIALIZE
   v_working_set` in full (scanning all 75,000 `workout_set` rows, joined to
   every `workout_session` row) before ever applying the outer
   `ws.local_date` filter, because `v_working_set` itself already joins
   `workout_set` to `workout_session` - joining it a second time gave the
   planner two copies of `workout_session` to reconcile, and it picked the
   expensive plan rather than pushing the range predicate through.
3. *Shipped: a correlated scalar subquery into `v_working_set`, evaluated
   per outer `workout_session` row instead of joined-then-grouped:*

   ```sql
   SELECT ws.id AS id, ws.local_date AS local_date,
          ws.plan_day_name_snapshot AS plan_day_name_snapshot,
          (SELECT COALESCE(SUM(vws.volume_kg), 0)
           FROM v_working_set vws
           WHERE vws.session_id = ws.id) AS total_volume_kg
   FROM workout_session ws
   WHERE ws.status = 'completed' AND ws.deleted_at IS NULL AND ws.local_date BETWEEN ? AND ?
   ORDER BY ws.local_date ASC
   ```

   `EXPLAIN QUERY PLAN` confirmed `SEARCH ws USING INDEX
   ix_session_local_date` as the first step (the partial index
   `database/schema.sql` already built for "History list, calendar, streaks,
   weekly summary"), then a per-matched-session `SEARCH ... USING INDEX
   ix_set_session (session_id=?)` for the subquery - `workout_session` gets
   filtered down to the handful of sessions in range *before* `workout_set`
   is ever touched. This reuses `v_working_set`'s own volume formula with no
   duplicated CASE expression to drift out of sync with the view (candidate
   2 would have needed one if reading `workout_set` directly to dodge the
   materialization issue - not needed here). Measured post-fix: 0ms on the
   fixture. Session-level grouping into `CalendarDayDto[]`
   (`groupSessionRowsByDay`, a `Map`-based JS reduce) is unchanged from the
   original step 2 implementation - only the SQL source changed.

**Verification after the fix:**
- `__tests__/features/calendar/repository/SqliteCalendarRepository.test.ts`
  (test-agent's step-4 suite, 16 tests) - all pass unmodified. No fixture or
  assertion changes were needed for this fix specifically (finding 3's
  separate same-day-ordering flake, and its fix, are test-agent's own work,
  unrelated to which query source `monthOverview` reads from).
- `__tests__/database/benchmarks.perf.test.ts` - the `calendar repository
  (P12)` case now passes: `Calendar yearOverview aggregation (1 year): 1-2ms
  (115 days)`, well under the 150ms budget.
- Full `__tests__/features/calendar/**` suite (9 suites, 88 tests) - all
  pass.
- `npx tsc --noEmit`, `npx eslint features/calendar/`, `npx prettier --check
  features/calendar/repository/SqliteCalendarRepository.ts` - all clean.
- No production behavior change beyond query source: both methods'
  `CalendarDayDto`/`CalendarYearDayDto` output shapes, filtering semantics
  (`status = 'completed' AND deleted_at IS NULL`), and volume-derivation
  formula (`v_working_set`'s own CASE expression, reused rather than
  reimplemented) are identical to the original step 2 implementation - only
  the SQL source and join/subquery shape changed, verified by the unchanged
  repository test suite passing against both the before and after query.

Only `features/calendar/repository/SqliteCalendarRepository.ts` was touched
by this follow-up - no interface/DTO/container change, no schema/migration
change, no test-file change.

### Step 3 (frontend-agent)

- `features/calendar/hooks/calendarKeys.ts` (new) - `calendarKeys.month(year,
  month)`/`calendarKeys.year(year)`, split into its own file so
  `useCalendarMonth`/`useCalendarYear` don't import each other's key
  builder. Both families start with the literal `'calendar'` segment, so
  `invalidateAfterWorkoutFinish`'s existing `queryKey: ['calendar']`
  invalidation (already wired in `features/workout-logging/hooks/
  invalidation.ts` since P9, in anticipation of this feature) matches both
  for free via TanStack Query's prefix matching - the brief's step 4 asked
  for this wiring, but it was already present; verified by reading the file
  rather than assumed, no change made there.
- `features/calendar/hooks/useCalendarMonth.ts` (new) - `useCalendarMonth
  (calendarRepository, year, month)`, a `useQuery` under
  `calendarKeys.month(year, month)` composing `generateMonthGrid` (pure) with
  `calendarRepository.monthOverview` and `computeDayIntensities` (run only
  over the month's own `isCurrentMonth` dates, never leaking a leading/
  trailing filler day into the quartile thresholds) into one gap-filled
  `CalendarMonthDayCell[]`. `calendarRepository` is a parameter, not resolved
  via an internal `useContainer()` call - this hook is barrel-exported and
  `services/container.ts` imports that same barrel, so a `useContainer()`
  call here would close a real `barrel -> hook -> container -> barrel` cycle,
  the same `import/no-cycle` failure mode `useCurrentRecords`/
  `useHomeDashboard` already document and avoid. `CalendarScreen.tsx` calls
  `useContainer()` itself and passes `calendarRepository` in.
- `features/calendar/hooks/useCalendarYear.ts` (new) - `useCalendarYear
  (calendarRepository, year)`, composing `calendarRepository.yearOverview`
  with a full-year `generateDateRange` gap-fill and `computeDayIntensities`
  into `DayIntensity[]` - the exact shape `HeatmapView` already consumes,
  mirroring P11's `useStatisticsDashboard.yearlyHeatmap` composition over
  this feature's own read model. Same parameter-not-`useContainer()` shape.
- `features/calendar/components/CalendarDayCell.tsx` (new) - one day cell:
  date number in a quartile-intensity-colored circle (same `rgba` alpha ramp
  over `color.success` `HeatmapView.tsx`'s own `LEVEL_COLOR` uses, kept in
  sync by eye since `components/charts` exports no per-level color), a small
  accent dot when a plan day was used, muted/non-interactive for
  `!isCurrentMonth` or untrained days. Only a current-month, trained day is
  `accessibilityRole="button"`-pressable; every other cell is a plain,
  non-interactive `accessible` node with its own descriptive label rather
  than an inert button - `buildCalendarDayAccessibilityLabel` (exported) is a
  real, data-summarizing label ("August 12, 2026, 3400 kg, Leg day"), using
  "kg" rather than the brief's illustrative "kilograms" to match this
  codebase's own existing accessibility-label convention
  (`statistics.volume.accessibilityLabelTemplate`,
  `records.list.rowAccessibilityLabelTemplate` both already say "kg").
- `features/calendar/components/CalendarMonth.tsx` (new) - the 7-column,
  Monday-first week grid (`flexWrap` at `100/7%` per cell, not a JS
  week-chunking loop), weekday header labels via new `calendar.weekday.*`
  catalog keys, wired to `onDayPress(cell)`.
- `features/calendar/components/CalendarLegend.tsx` (new) - a static
  "Less -> More" 5-swatch strip explaining the intensity ramp, translated via
  new `calendar.legend.*` keys, one `accessible` summary node (not five
  separately-announced swatches).
- `features/calendar/components/CalendarDaySessionPicker.tsx` (new) - the
  day-session picker sheet content, `present()`d into the existing
  `SheetHost`/`BottomSheet`/`sheetStore` (no new sheet mechanism built) for
  the rare multi-session day. `ListRow`-based rows mirroring
  `WorkoutHistoryListScreen`'s/`PersonalRecordsScreen`'s row style; each row
  navigates to `routes.history.detail(sessionId)` and dismisses the sheet
  first.
- `features/calendar/components/CalendarYearHeatmapCard.tsx` (new) - reuses
  `components/charts/HeatmapView` verbatim (no second heatmap renderer),
  mirroring `features/statistics/components/YearlyHeatmapCard.tsx`'s
  `ChartCard` wiring almost exactly, with its own translated, count-aware
  `calendar.yearHeatmap.accessibilityLabel` ("2026 training activity, N
  training days") rather than reusing `statistics`'s wording.
- `features/calendar/screens/CalendarScreen.tsx` (new) - month/year
  `SegmentedControl` toggle, prev/next month navigation via
  `addMonthsToLocalDate` (local `monthAnchor` component state, not a route
  param - this screen has exactly one entry point and nothing deep-links
  into a specific month yet), the `CalendarMonth` grid plus `CalendarLegend`
  below it, a real `EmptyState` block rendered **alongside** the grid (not
  instead of it) when the month has zero trained days - the grid itself
  always renders per `generateMonthGrid`'s own "renders cleanly even with an
  empty repository result" contract, so "not a blank grid" is satisfied by
  the grid always being present; the empty state is additive, not a
  replacement. Loading skeleton, `AccessibilityInfo.announceForAccessibility`
  for both loading and month-empty states. Day-tap: exactly one session ->
  `router.push(routes.history.detail(sessionId))`; more than one ->
  `useSheetStore.getState().present(...)` with `CalendarDaySessionPicker`.
  Resolves `calendarRepository`/`clock` via `useContainer()` here, passed
  into both hooks - the initial `monthAnchor` is `startOfMonth(clock.
  localDate())`, not a bare `new Date()` (post-review fix, see below).
- `app/profile/calendar.tsx` (new) - thin wrapper importing `CalendarScreen`
  by direct file path, matching `app/profile/history.tsx`'s exact shape.
- `navigation/routes.ts` (modified) - added `routes.profile.calendar()` ->
  `/profile/calendar`, alongside `profile.records`/`profile.history`.
- `features/profile/screens/ProfileScreen.tsx` (modified) - added a
  "Training calendar" `ListRow` row between "Training history" and
  "Settings", same shape/testID convention as the existing rows.
- `features/calendar/index.ts` (modified) - barrel now also exports
  `calendarKeys`, `useCalendarMonth`/`CalendarMonthDayCell`,
  `useCalendarYear`. Components/screens still not barrel-exported (screens
  never are in this codebase; components have no cross-feature consumer).
- `i18n/catalogs/en.ts` (modified) - added a new `calendar` top-level
  section (`screenTitle`, `loadErrorMessage`, `view.*`, `month.*`,
  `weekday.*`, `dayCell.*`, `legend.*`, `yearHeatmap.*`, `sessionPicker.*`,
  `profileRowTitle`).
- No change to `features/workout-logging/hooks/invalidation.ts` - its
  `['calendar']` invalidation was already wired (P9, in anticipation of this
  feature); confirmed by reading the file, not assumed from the brief.
- Verification: `npx tsc --noEmit` clean; `npx eslint .` (repo-wide) clean (0
  errors, the same 31 pre-existing `no-require-imports` test-file warnings
  every prior phase has); `npx prettier --check` clean on every touched file
  (one `--write` needed on `CalendarDayCell.tsx` for a wrapping fix Prettier
  applied itself); `npx expo export --platform ios` bundled successfully -
  also used to regenerate Expo Router's typed-route declarations
  (`.expo/types/router.d.ts`), which turned out to require a brief `expo
  start` run instead (`expo export` does not trigger the type-generation
  step; confirmed by reading `@expo/cli`'s source before concluding this),
  killed once `/profile/calendar` appeared in the generated types. No
  simulator/emulator/dev-client available in this environment, the same
  standing constraint every phase since P4 has flagged.

**Post-review fixes (2026-08-19, coordinator diff review, before handoff to
test-agent):** two small, mechanical findings fixed - (1)
`CalendarScreen.tsx`'s `currentMonthAnchor()` called `new Date()` directly
instead of going through the injected `Clock`; replaced with `startOfMonth
(clock.localDate())` (`clock` now destructured from `useContainer()`
alongside `calendarRepository`), matching `useStatisticsDashboard`/
`useHomeDashboard`'s existing convention, and the now-unused
`currentMonthAnchor()` function was deleted. (2) The 5-entry intensity color
ramp was duplicated verbatim in `CalendarDayCell.tsx` and
`CalendarLegend.tsx`; extracted to a new shared
`features/calendar/components/calendarIntensityColors.ts`
(`CALENDAR_LEVEL_BACKGROUND`), imported by both, carrying forward the
existing doc-comment explaining why it isn't imported from
`components/charts/HeatmapView.tsx` instead. Re-verified clean after both
fixes: `npx tsc --noEmit`, `npx eslint features/calendar/`, `npx prettier
--check` on every touched file.

## Notes

- Branch: `feat/p12-calendar`, cut from `main` at `3c312b2` (PR #16, P11 merge).
- Step 0 decisions confirmed with user: keep deferring dev-client build; own
  `CalendarRepository` read model; calendar-owned binning + shared `HeatmapView`;
  custom-built calendar grid; direct-navigate-or-picker-sheet for multi-session days.
- Plan file: `plans/2026-08-19-p12-calendar.md`.
