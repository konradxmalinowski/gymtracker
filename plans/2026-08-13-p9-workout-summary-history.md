# P9 - Workout summary and history

Branch: `feat/p9-workout-summary-history` (cut from `main` at `5e004cf`, which already
carries the merged `feat/p8-progressive-overload` PR #12 - no branch-note caveat this
time, unlike P8/P7).

## Problem summary

Per `docs/ROADMAP.md`'s P9 entry: finishing a workout currently drops the user straight
back to Home with no summary (`useFinishDiscardWorkout` calls `router.replace(routes.tabs.home())`
and nothing else). Past workouts are invisible - there is no history list, no session
detail, no way to review or correct a past entry. This phase closes both gaps.

## Acceptance criteria (from ROADMAP.md, unchanged)

- Totals on the summary screen equal a fresh recomputation from `workout_set` (not a
  second, independently-derived calculation).
- The history list scrolls at 60 fps over a 2,500-session fixture.
- Editing a past session that held a PR correctly promotes the next-best record.
- A deleted session disappears from history and from every aggregate (PR list, any
  future statistics).

## Non-goals

- No statistics/charting (P11). No calendar (P12). No body-metrics-based calorie
  refinement (P13 doesn't exist yet - see the calorie-formula decision below).
- No retroactive calorie backfill for sessions finished before this phase, or for
  sessions finished with the setting off - `estimated_kcal` simply stays `null` for
  those rows, same as every other "off by default" setting in this codebase.
- No dedicated "edit session" route - editing happens inline on `history/[sessionId]`
  via an edit-mode toggle, per the folder tree in `docs/ARCHITECTURE.md` section 9,
  which lists only `history/[sessionId].tsx`, no separate edit screen.

## Decisions made this phase (Step 0 questions, answered)

1. **Estimated calories formula**: a flat kcal-per-minute constant applied to
   `durationSeconds`, no bodyweight input added. Rationale: the app has no bodyweight
   tracking until P13; adding a bodyweight field purely to unblock this estimate would
   be scope creep for a value that's explicitly labeled "estimate" and off by default
   anyway. This needs its own ADR since D-04's decision register only settled *that*
   calories are shown, not *how* they're computed - see "New ADR" below.
2. **Share-as-image**: `react-native-view-shot` (capture) + `expo-sharing` (native
   share sheet), both new dependencies. Captures the visible summary screen as a PNG.
3. **Historical session edit scope**: full edit, including adding or removing whole
   exercises from a past session, not just editing sets/values/notes within exercises
   it already had.
4. **Build verification**: no dev client/simulator available this phase either -
   `npx expo export --platform ios` continues as the build-verification proxy, same
   constraint as every phase since P4 (flagged again, not silently reused).

## New ADR required

`docs/adr/0018-estimated-calories-formula.md` - documents the flat kcal/min constant
decision above, the constant's value (proposed starting point: 5 kcal per minute of
`duration_seconds`, i.e. the same duration already denormalized on `workout_session`;
excludes paused time by construction since `duration_seconds` already does), and the
explicit non-goal of retroactive backfill. The exact constant is a defensible estimate,
not a precision claim - the summary screen labels it "estimate" per D-04 regardless of
the number chosen. docs-agent drafts this ADR in Step 10 from the domain-agent's actual
implementation, not before, so the ADR reflects the real constant/function name rather
than a preview of one that might change while coding.

## Task shape

Single application (React Native/Expo, offline, no server). Per the precedent
established in every prior phase (see `plans/2026-08-11-p8-progressive-overload.md`'s
own note, and P4-P7's plans before it): this project's SQLite repository/service layer
is `frontend-agent`'s scope, not `database-agent`'s (no schema migration needed - see
below) or `backend-agent`'s (no server exists). Internally split into **three
sequential frontend-agent passes** (domain -> repository/service -> UI), same reasoning
P7/P8 used: the UI layer directly consumes the repository contracts, so building them
concurrently risks a contract mismatch.

No new database migration: `workout_session.estimated_kcal`, `.total_volume_kg`,
`.total_sets`, `.total_reps`, `.duration_seconds` are all already columns in
`database/schema.sql` since P2 (confirmed by direct read) - `finish()` already
denormalizes the first four; this phase adds `estimated_kcal` to that same write and
adds the read/list/edit/delete paths on top of the existing table.

## Affected layers

- `features/workout-logging/domain/` - new `EstimatedCalories.ts` pure calculator
  (fast-check property test, same discipline as `SessionTotals.ts`/`Estimated1RM.ts`).
- `features/workout-logging/repository/` - `WorkoutSessionRepository.ts` /
  `SqliteWorkoutSessionRepository.ts` gain `listHistory`, `getSession`,
  `updateHistoricalSession`, and a `deleteSession` (see "Delete" below) - the three
  methods ARCHITECTURE.md section 8.3 already names as P9-scoped and deliberately
  left absent through P6-P8, plus `finish()` extended to write `estimated_kcal` when
  the setting is on.
- `features/workout-logging/services/WorkoutSessionService.ts` - Zod-validated
  wrappers for the above, reading `workout.showEstimatedCalories` (new settings key)
  the same way it already reads `timer.defaultRestSeconds`.
- `features/records/` - no new repository method needed; `PersonalRecordRepository.rebuild(exerciseIds)`
  already exists (P8) and is exactly what a historical edit or session delete calls
  for the affected exercises.
- `repositories/settings/settingsSchema.ts` - new `workout.showEstimatedCalories`
  boolean key (default `false`, per D-04), same shape as `haptics.enabled`.
- `features/workout-logging/screens/` - new `WorkoutSummaryScreen.tsx`,
  `WorkoutHistoryListScreen.tsx`, `WorkoutHistoryDetailScreen.tsx` (read-only + inline
  edit mode).
- `features/workout-logging/components/` - a `ShareableSummaryCard.tsx` (the exact
  subtree `react-native-view-shot` captures), month-grouped history row components.
- `app/workout/summary/[sessionId].tsx` (new, inside the existing `app/workout/`
  full-screen stack per the ARCHITECTURE.md folder tree), `app/history/[sessionId].tsx`
  (new, root-level per the same tree), `app/profile/history.tsx` (new - see routing
  gap note below).
- `navigation/routes.ts` - `routes.workout.summary(sessionId)`,
  `routes.history.detail(sessionId)`, `routes.profile.history()`.
- `features/profile/screens/ProfileScreen.tsx` - new "Training history" row, same
  `ListRow` pattern as P8's "Personal records" row.
- `features/profile/screens/SettingsScreen.tsx` - new "Estimated calories" `Switch`
  row (single boolean, no dedicated sub-screen - mirrors the existing
  `haptics.enabled` row, not P7/P8's multi-field sub-screens).
- `features/workout-logging/hooks/useFinishDiscardWorkout.ts` - `finish()` now
  navigates to `routes.workout.summary(sessionId)` instead of Home.
- `package.json` - `react-native-view-shot`, `expo-sharing`.
- `i18n/catalogs/en.ts` - new strings.
- `services/container.ts` - no new entries; `sessionRepository`/`sessionService`
  already exist, this phase only adds methods to them.

## Routing gap this plan resolves (flagged, not silently invented)

`docs/ARCHITECTURE.md`'s section 9 folder tree and section 10 route graph both show
`history/[sessionId].tsx` (the detail route) but neither shows the **list** route the
roadmap's "history list on the profile tab" prose requires - only a `HOME --> HIST`
edge exists in the mermaid graph (P10 scope, not yet built) and a `CAL --> HIST` edge
(P12, not yet built). Until P10/P12 land, the list needs its own entry point today.
Resolution, following the exact precedent P8 set with `/profile/records` (a
profile-scoped, non-tab, non-nested route reached via a `ListRow`, not folded into a
tab's own nested stack): `app/profile/history.tsx` -> `routes.profile.history()`. This
is a documented judgment call for docs-agent to fold back into
`docs/ARCHITECTURE.md`'s route tree/graph in Step 10, not a deviation requiring
sign-off - it fills a gap the two source documents left implicit, using an
already-established pattern from the same document.

## Delete semantics (judgment call, flagged)

The roadmap says "deleting a session with confirmation" with no mention of undo -
unlike day/day-exercise deletes elsewhere in the app, which get a soft-delete +
undo-toast. `workout_session` does carry a `deleted_at` column, but the aggregate-level
delete precedent in this codebase (`PlanRepository.purgePlan` - confirm dialog, no
undo, hard delete, fires `ON DELETE CASCADE`) is for exactly this shape: removing a
whole aggregate root the user is looking at directly, not a child row nested under one.
This plan follows that precedent: `deleteSession` is a hard delete (real `DELETE FROM
workout_session`, cascading to its `session_exercise`/`workout_set` rows), gated behind
`ConfirmDialog`, no undo - then calls `PersonalRecordRepository.rebuild()` for every
exercise that appeared in the deleted session, satisfying "a deleted session
disappears... from every aggregate" for the PR list specifically.

## Historical edit mechanism (judgment call, flagged)

`updateHistoricalSession(id, patch)` is ARCHITECTURE.md's literal signature, but its
own scope note ties it to "values, notes" - not exercise add/remove, which Step 0
extended into scope. Rather than inventing one large patch type that duplicates the
granular mutation methods `SqliteWorkoutSessionRepository` already has
(`addExercise`/`removeExercise`/`appendSet`/`updateSet`/`deleteSet`/`restoreSet`/
`setExerciseNote`), this plan reuses those methods directly: their internal
`requireInProgressSession` guard is loosened to `requireInProgressOrCompletedSession`
(a new private helper, `discarded` still rejected), so the exact same methods the
active-workout screen already calls now also work against a `completed` session.
`updateHistoricalSession(id, patch)` stays as the literal spec's smaller surface -
session-level `notes` only, the one field none of the granular methods cover. Every
one of the granular methods, when it mutates a `completed` session, must, inside the
same transaction: (a) recompute and rewrite the session's denormalized totals via the
existing `computeSessionTotals` (and `estimated_kcal` if the setting is on) - they go
stale the moment a historical set changes - and (b) call
`personalRecordRepository.rebuild([affectedExerciseId], tx)` for the exercise(s) the
edit touched. This is the same "no repository ever `new`s another repository, everyone
composes through an injected instance and a shared `tx`" discipline P8's
`completeSet` -> `evaluateAndUpsert` wiring already established - reused, not
re-invented.

## Edge cases

**System side**: a historical edit that empties out an exercise entirely (all its sets
removed) - the exercise row itself should be soft-removed too (reuse
`removeExercise`), not left as an empty card; a historical edit or delete on a session
that currently holds the *only* record for an exercise must correctly promote the
next-best PR or clear the PR entirely if none remain (`rebuild()` already handles this
correctly per P8's own equivalence test - this phase adds no new PR-computation logic,
only new call sites); deleting a session mid-way through editing it (rapid double-tap)
- `ConfirmDialog`'s known unguarded-double-tap gap (already flagged non-blocking in
P8's security report) applies here too, not newly introduced; the 2,500-session
history-list fixture must page/window rather than load all rows (`listHistory` takes a
bounded `limit`/`offset` or cursor, following `repositories/query/`'s existing
whitelisted-orderby + clamped-limit helpers - never `SELECT *` with no bound).

**Human side**: a user shares the summary image before the screen has finished
laying out (view-shot capture too early) - capture is gated on the screen's own mount/
layout-complete signal, not fired immediately on navigation; a user backs out of the
summary screen without ever seeing it fully (should still be reachable again later via
history, not a one-time-only view); editing a session's date/session-level fields is
explicitly out of scope (only notes, sets, exercises) so no UI affordance for
`local_date`/`started_at` editing should appear, avoiding a false promise of what "edit"
covers; deleting a session is irreversible per the decision above - the `ConfirmDialog`
copy must say so plainly ("This cannot be undone"), not just show a generic confirm.

## NFR

60 fps history-list scroll over a 2,500-session fixture (roadmap's own bound, tighter
than ARCHITECTURE.md's NFR-04 baseline of 1,000+). Pattern: FlashList with fixed row
height estimates (same approach the exercise library and plan lists already use),
month-grouped via section headers computed client-side from `local_date`, and
`listHistory` itself paginated at the repository level so the screen never holds more
than a window of rows in memory or in the FlashList's own data array at once. A new
benchmark case is added to `__tests__/database/benchmarks.perf.test.ts` (ADR-0014) for
`listHistory` against the 2,500-session fixture, joining P4's exercise-search and P2's
existing benchmarks rather than starting a separate perf suite.

## Feature flags

Not applicable - this project has no feature-flag system (confirmed absent in Step 2).

## Agent delegation plan

| Step | Agent | Files owned | Parallel/Sequential |
|---|---|---|---|
| Pass 1: domain calculator + settings key + tests | frontend-agent | `features/workout-logging/domain/EstimatedCalories.ts` (new), `repositories/settings/settingsSchema.ts` (new `workout.showEstimatedCalories` key), their `__tests__/**` counterparts | Sequential, first |
| Pass 2: repository/service extensions + tests | frontend-agent | `features/workout-logging/repository/{WorkoutSessionRepository.ts,SqliteWorkoutSessionRepository.ts}` (`listHistory`, `getSession`, `updateHistoricalSession`, `deleteSession`, loosened status guard on the granular mutation methods, `finish()` writing `estimated_kcal`), `features/workout-logging/services/WorkoutSessionService.ts`, their `__tests__/**` counterparts including a PR-promotion-on-edit integration test and a delete-cascades-to-PR-rebuild test | Sequential, second (depends on pass 1's calculator + settings key) |
| Pass 3: UI - summary/history screens, share action, navigation, settings row | frontend-agent | `features/workout-logging/screens/{WorkoutSummaryScreen.tsx,WorkoutHistoryListScreen.tsx,WorkoutHistoryDetailScreen.tsx}` (new), `features/workout-logging/components/{ShareableSummaryCard.tsx,*HistoryRow.tsx}` (new), `features/workout-logging/hooks/useFinishDiscardWorkout.ts` (navigate to summary), `app/workout/summary/[sessionId].tsx`, `app/history/[sessionId].tsx`, `app/profile/history.tsx` (new routes), `navigation/routes.ts`, `features/profile/screens/{ProfileScreen.tsx,SettingsScreen.tsx}` (new rows), `i18n/catalogs/en.ts`, `package.json`/`package-lock.json` (new deps), their `__tests__/**` counterparts | Sequential, third (depends on pass 1 + pass 2 contracts) |
| Test coverage gaps after all three passes | test-agent | any new code the three passes didn't already cover; explicit focus on the 2,500-session benchmark and the FlashList windowing behavior | Sequential, after pass 3 |
| Code review | orchestrator (this session) | read-only over the full diff, including the design-patterns-competencies cross-check | After test-agent |
| Security review | security-agent-sonnet | read-only - new dependencies (`react-native-view-shot`, `expo-sharing`) trigger the dependency-audit condition; hard-delete-with-no-undo on `deleteSession` and the loosened in-progress-or-completed guard on mutation methods are worth a routine look for unintended write paths | After code review |
| Accessibility review | accessibility-agent | read-only - the summary screen, history list/detail, the new settings row, the share action's accessible label | Parallel with security review (both read-only, no file conflict) |
| Docs | docs-agent | `CLAUDE.md`, `docs/architecture-snapshot.md`, `docs/ARCHITECTURE.md` (route tree/graph gap fix, section 8.3 method additions), new `docs/adr/0018-estimated-calories-formula.md` | After security/accessibility |
| Commit | git-commit-agent | staged per logical group (domain+settings, repository+service, UI+deps, docs) | After docs |

Escalation trigger: if pass 2's loosened-guard/PR-rebuild wiring turns out to touch
more of `SqliteWorkoutSessionRepository`'s transaction structure than expected (e.g. a
real risk of the totals-recompute and PR-rebuild steps racing against each other the
way P7's timer-write race did), stop and flag it rather than pushing through - that
class of bug was real and costly enough last time (P7's `bumpTimerOperationSequence`
fix) to treat a second occurrence as a decision point, not a routine fix.
