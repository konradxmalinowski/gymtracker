# P10 - Home dashboard

## Problem summary

`docs/ROADMAP.md` draws the MVP line after P10: assemble the Home tab into a real
dashboard - active plan with a suggested next day, Quick Start, a resume affordance,
last workout, training streak, latest PR, weekly summary, correct empty states,
pull-to-refresh - so the app is a coherent, publishable v1.0 product. Today
`app/(tabs)/index.tsx` is still the deliberate P6-era placeholder (wordmark plus a
single Quick Start button); no `home` feature directory exists yet.

## Acceptance criteria (from docs/ROADMAP.md P10)

- Every card has a correct, designed empty state on a fresh install.
- The streak is correct across a DST boundary (unit-tested) and across midnight.
- The resume banner appears after a crash and routes into the workout.
- The whole dashboard loads as a single composed query, not N staggered
  screen-level loading states.

## Decisions made this session (user-confirmed)

1. **Streak/weekly-summary data source**: lightweight, home-owned read queries
   added where the data already lives, not a pulled-forward `StatisticsRepository`
   (that stays P11 scope, still an empty skeleton). `docs/ARCHITECTURE.md` section
   8.3 lists `streak()`/`weeklySummary()` on `StatisticsRepository` - this is a
   real, documented deviation from that table for v1.0, to be recorded as an ADR
   (see Step 10 below) so P11 knows to either keep Home on its own read model or
   migrate it onto the real `StatisticsRepository` once that exists.
2. **"Next suggested day" definition**: simple rotation - the day after whichever
   plan day the most recently completed session for the active plan used, cycling
   by `sort_order`, wrapping to the first day after the last. No streak/rest-day
   awareness (that is the existing backlog item, unchanged).
3. **Quick Start behavior**: unchanged from P6 - always starts an empty workout.
   The suggested next day is a separate, explicit action on the active-plan card
   (reusing the existing `startFromPlanDay` hook already built for
   `PlanDetailScreen`/`PlanDayCard` in P5/P6), not folded into Quick Start.
4. **On-device verification**: deferred again, same as P7/P8/P9. Verification proxy
   stays typecheck/lint/jest/`expo export --platform ios`. The dev-client gap is
   flagged again in this phase's write-up per the standing feedback memory rather
   than silently repeated without comment.

## Task shape and scale

Single application (GymTracker, React Native/Expo), single platform (mobile - no
web/desktop surface). One coherent feature spanning a new read-only data layer plus
a full screen rebuild. Not parallelizable across applications (there is only one);
the domain/repository slice and the UI slice have a real contract dependency (the
UI consumes the repository's DTOs), so they run **sequentially**, not in parallel -
see Agent delegation plan below.

## Platform

React Native / Expo (mobile), detected from `package.json` (`expo`,
`react-native`) and confirmed against `CLAUDE.md`'s Stack section. No web or
desktop surface exists in this project, so Step 9b (SEO) and the crawler/robots.txt
portion of Step 9d (LLM accessibility) are skipped and stated as not applicable.
Step 9e (accessibility/WCAG-style review, applied to RN accessibility props) still
applies, as it has for every prior phase.

## New feature: `features/home/`

`docs/ARCHITECTURE.md` section 9.1's dependency graph already names `home`
alongside `statistics`/`calendar`/`data-transfer` as a read-side dependent of
`workout-logging` ("Nothing depends on `workout-logging` except read-side features
(`statistics`, `calendar`, `home`, `data-transfer`)"), even though `CLAUDE.md`'s
current "twelve features total" enumeration and the `features/` folder listing
don't yet include it. This phase resolves that gap by adding the feature directory
for real, the same way `statistics`/`calendar`/`body-metrics`/`data-transfer`
already exist as scaffolded feature directories ahead of their own phase. Depends
on `workout-logging`, `plans`, `records` (read-only, one direction - nothing
depends back on `home`), consistent with the dependency graph. `app/(tabs)/index.tsx`
becomes a thin wrapper into `features/home/screens/HomeScreen.tsx`, matching every
other tab's existing shape and the folder-structure rule ("`app/` never contains
screen bodies").

### Domain layer (zero React/RN/Expo imports, pure, table-driven + property tests)

- `features/home/domain/StreakCalculator.ts`: given a set of `local_date` strings
  with a completed session and "today's" `local_date` (from the injected `Clock`,
  never `Date.now()` directly, per the project's timezone-safety convention),
  returns the current consecutive-day streak. Grace rule: if today has no
  completed session yet, the streak still counts through yesterday (it isn't
  broken by "haven't trained yet today"); it only breaks once a full calendar day
  passes with zero completed sessions. Property-tested (fast-check) plus explicit
  DST-boundary and midnight-boundary unit tests per the acceptance criteria above.
- `features/home/domain/nextSuggestedPlanDay.ts`: given the active plan's ordered
  days (by `sort_order`) and the `plan_day_id` of the most recent completed
  session against that plan (or `null`), returns the next day per decision 2
  above. Pure, table-driven tests including "no prior session" (returns the first
  day) and "last day was the plan's last day" (wraps to the first).

### Read model (mirrors `ExerciseHistoryRepository`'s P8 precedent: flat DTOs,
no accompanying service, nothing to validate)

`features/home/repository/{HomeDashboardRepository.ts, SqliteHomeDashboardRepository.ts}`:

```
getTrainingLocalDates(sinceLocalDate: string): Promise<string[]>   // completed sessions only, feeds StreakCalculator
getWeeklySummary(localDateFrom: string, localDateTo: string): Promise<{
  workouts: number; sets: number; volumeKg: number; durationSeconds: number;
}>                                                                  // single SQL aggregate (SUM/COUNT) over workout_session,
                                                                     // status = 'completed' - the totals are already
                                                                     // denormalized on finish (schema section 7.6), so this
                                                                     // is a single-table aggregate, no join to workout_set
getLastCompletedSession(): Promise<HomeLastSessionDto | null>
getMostRecentCompletedPlanDayId(planId: string): Promise<string | null>  // feeds nextSuggestedPlanDay
```

Every query filters `deleted_at IS NULL` and is parameterized (existing
`repositories/query` builder). `services/container.ts` gains
`homeDashboardRepository` - the seventh feature repository added to `AppContainer`
after P3-P9's profile/exercise-library/plans/workout-logging/records/
exercise-history ones, same "extend, don't replace" pattern every prior phase used.

### Presentation

- `features/home/hooks/useHomeDashboard.ts`: one `useQuery` under the
  `['home','dashboard']` key (per the roadmap's own query-key note) whose `queryFn`
  runs every piece above via `Promise.all` (own repository calls plus the active
  plan/plan-days from `plans`' barrel and `listRecent(1)` from `records`' barrel) -
  the screen sees one `isPending`/`isError`/`refetch`, not five independent ones.
  `refetch` backs pull-to-refresh. Invalidated on workout finish/discard and on
  historical session edit/delete, alongside this project's existing centralized
  invalidation list (`features/workout-logging/hooks/invalidation.ts`).
- `features/home/components/`: `ActivePlanCard` (shows the suggested next day,
  a "Start" action wired to the existing `startFromPlanDay` hook, and a
  "change day" action opening the new plan-day-picker modal when the plan has
  more than one day), `LastWorkoutCard` (taps through to the existing
  `routes.history.detail`), `StreakCard`, `LatestPRCard`, `WeeklySummaryCard` -
  each with its own real, designed empty state (no active plan; never trained;
  no PR yet), not a shared generic placeholder.
- `features/home/screens/HomeScreen.tsx`: assembles the cards plus the existing
  Quick Start button (unchanged, per decision 3) in a `Screen scroll` with
  `RefreshControl` wired to the dashboard hook's `refetch`.
- `app/(modals)/plan-day-picker.tsx`: new modal, reusing the `(modals)` group
  established in P5, listing the active plan's days for the case where the
  suggested day isn't the one the user wants to start - registered in
  `app/(modals)/_layout.tsx` and `navigation/routes.ts`
  (`routes.modals.planDayPicker(planId)`), mirroring `exercisePicker`'s existing
  shape (a plain route param, no store needed - the "result" is a single
  `planDayId` picked once, same class as `restTimerSettings`'s single-id case,
  not the unbounded-list case `exercisePicker` needed a store for).
- Resume banner: **no new work.** `ActiveWorkoutBanner` (built in P6, docked in
  `app/(tabs)/_layout.tsx`) already satisfies this acceptance criterion; this
  phase only re-confirms it in review rather than re-implementing it.
- New i18n strings for every card/empty-state/action added to `i18n/catalogs/en.ts`.

## Edge cases to address (Step 6a will re-verify, not just this list)

- Fresh install: no profile data yet for any card - each renders its own designed
  empty state, not a shared spinner or blank space.
- No active plan: `ActivePlanCard` shows a "no active plan" empty state pointing at
  Plans, not a broken suggested-day computation.
- Active plan with only one day: no "change day" action shown (nothing to pick).
- A completed session whose `plan_id`/`plan_day_id` was soft-deleted or purged
  (P5's plan-delete-survives-in-snapshot behavior): next-day rotation falls back
  to "no prior session for this plan" rather than throwing.
- Streak at a DST transition and at local midnight: covered by the domain layer's
  own tests per the acceptance criteria.
- Two dashboard refetches racing (fast pull-to-refresh double-trigger): TanStack
  Query's own dedup on an identical in-flight key covers this; verified, not
  reimplemented.
- A workout finished seconds before the dashboard loads: invalidation list must
  include the dashboard key so the just-finished session is reflected without a
  manual refresh.

## Agent delegation plan

Sequential (not parallel) - the UI slice consumes the exact repository/domain
contract the first slice produces, so splitting them would risk a mismatched
interface, the same reasoning that guided every prior phase's pass ordering.

| Step | Agent | Owns | Depends on |
|---|---|---|---|
| 1 | backend-agent-sonnet | `features/home/domain/*` (+ tests), `features/home/repository/*` (+ integration tests via `NodeSqlExecutor`), `features/home/index.ts` (repository/domain exports only), `services/container.ts` (`homeDashboardRepository`) | - |
| 2 | frontend-agent | `features/home/hooks/*`, `features/home/components/*`, `features/home/screens/HomeScreen.tsx`, `features/home/index.ts` (extend with screen/component exports per this codebase's "screens never barrel-exported" rule - only hooks/components), `app/(tabs)/index.tsx` (thin wrapper), `app/(modals)/plan-day-picker.tsx` + `_layout.tsx` registration, `navigation/routes.ts` (`modals.planDayPicker`), `i18n/catalogs/en.ts` | Step 1's repository contract |
| 3 | test-agent | Coverage gap-fill pass across both slices, same "Pass 1/2 then gap-fill" shape P8/P9 used | Steps 1-2 |
| 4 | (orchestrator) code review | Step 6 below | Steps 1-3 |
| 5 | security-agent-sonnet | Routine review - new SQL queries added (parameterization, `deleted_at` filtering), no schema change, no new dependency expected | Step 4 |
| 6 | accessibility-agent (or general-purpose stand-in, per this project's established substitution pattern) | New cards/modal: labels, roles, hit targets, loading/empty-state announcements | Step 4 |
| 7 | docs-agent | `CLAUDE.md`, `CHANGELOG.md`, `docs/architecture-snapshot.md` (also fixes the stale `TBD-at-commit-time` header left over from P9), `docs/ARCHITECTURE.md` (folder tree, dependency graph count, section 8.3 addition, section 6.2 additions), new `docs/adr/0019-home-dashboard-read-model.md` recording decision 1 above and the migration note for P11 | Steps 1-6 |
| 8 | git-commit-agent | Commits, split by topic (see below) | Step 7 |

Conditional steps not triggered: database-agent (no schema change - all data
already exists and is denormalized on `workout_session`), devsecops-agent (no
CI/CD, Docker, env var, or infra change), seo-agent and the crawler portion of
llm-accessibility-agent (no web surface).

## Commit split (Step 11 preview, finalized after review)

1. `feat: add home dashboard domain calculators and read model repository`
   (domain + repository + container wiring + their tests)
2. `feat: add home dashboard screen with plan suggestion, streak and weekly summary`
   (hooks + components + screen + app/ wrapper + plan-day-picker modal + routes + i18n)
3. `docs: document home dashboard phase and read-model decision` (CLAUDE.md,
   CHANGELOG.md, architecture-snapshot.md, ARCHITECTURE.md, new ADR, this plan/state
   file)

## NFR decisions

No non-trivial NFR was raised for this phase beyond what P2's benchmark suite
already guards (local SQLite read latency). The dashboard's aggregate queries run
against an already-indexed column (`ix_session_local_date`) and denormalized
totals, so no new caching, retry, or rate-limit pattern is needed - flagged
explicitly rather than left implicit, per this workflow's NFR rule.

## Feature-flag decision

Not applicable - this project has no feature-flag system (confirmed against
`CLAUDE.md`'s Stack section), so this question is not raised per the workflow's
own rule.
