# P8 - Progressive overload and personal records

## Problem summary

Phase 8 of `docs/ROADMAP.md`: the app tells the user what to do next and celebrates
when they beat something. Three P4-P6 gaps get closed here, all deliberately deferred
by design at the time:

- `PreviousPerformancePanel` (`features/workout-logging/components/`) currently
  renders a hardcoded empty state - the doc comment on the file names this exact gap
  and says the read path is P8's job.
- `ExerciseDetailScreen`'s "previous performance" and "personal records" sections
  (`features/exercise-library/screens/`) render `PerformanceEmptySection` with no
  data source, per P4's own write-up ("genuinely empty pending P8").
- `CompletedSetResult.newPRs` is typed `readonly never[]` and always `[]` (P6 write-up).

## Acceptance criteria (from ROADMAP.md, verbatim scope, plus ADR-0015)

- Incremental PR evaluation (inside the set-completion transaction) and a full
  `rebuild()` produce identical tables across a generated history - an explicit
  equivalence test, not just eyeballing.
- `Estimated1RM` returns `null` above 12 reps, for `reps <= 0`, for `weight_kg <= 0`,
  and for any set type other than `normal`/`failure`; the UI shows nothing rather than
  a fabricated number in that case.
- `ProgressionAdvisor` follows the double-progression rules in ADR-0015 exactly
  (first-time / no-target-range / hit-max / below-min / otherwise), including the
  dumbbell-snap-to-nearest-2kg case.
- Warm-up, drop, assisted and partial sets never set a PR (only `normal`/`failure` are
  eligible, per the ADR-0015 record-type eligibility table).
- Deleting or editing a historical session triggers a rebuild for the affected
  exercises and the PR list updates.
- `ux_pr_current` (already in schema since P2) is respected - at most one current
  record per `(exercise_id, record_type, rep_bucket)`.

## Task shape and scale

Single application (GymTracker RN/Expo client, offline-only, no separate backend).
One coherent roadmap phase. No schema/migration needed - `personal_record` and every
column P8 touches (`session_exercise.rest_seconds_override` excluded, that's P7's)
already exist from P2's single migration; confirmed by reading `database/schema.sql`
directly before writing this plan. No `database-agent`/`backend-agent` delegation
needed for that reason - same precedent P4-P7 established: in this project, the
SQLite repository/service layer for a feature is `frontend-agent`'s scope (there is no
server), it is not routed to `database-agent` (schema changes only) or
`backend-agent` (no server exists to route to).

Internally split into **three sequential** `frontend-agent` passes, same reasoning
P7 used: the UI layer directly consumes the domain/repository contracts, so building
them concurrently risks a contract mismatch between the PR/1RM math and the screens
that render it.

## Platform

React Native / Expo (iOS 15+, Android 8/API 26+) - unchanged from every prior phase.
No web surface, so Step 9b (SEO) and the crawler portion of Step 9d are skipped, as in
every prior phase. Step 2a re-checked: no environment/toolchain mismatch found
(`package.json` unchanged since P7's check). No simulator/emulator/dev client is
available in this environment - **user-confirmed 2026-08-11**: still deferred, `npx
expo export --platform ios` remains the Step 7 build-verification proxy, same as every
phase P3-P7.

## Branch note (integration risk, flagged not hidden)

This branch (`feat/p8-progressive-overload`) was cut from `main` **before**
`feat/p7-rest-timer`'s PR (#11) was merged, per explicit user decision when P8 was
kicked off - P7 was pushed and its PR opened first, but P8 was intentionally branched
from `main` rather than stacked on P7, so the two can be reviewed independently. This
means P8's branch does not contain P7's rest-timer code. Both phases touch
`features/workout-logging/repository/{WorkoutSessionRepository.ts,
SqliteWorkoutSessionRepository.ts}`, `features/workout-logging/services/
WorkoutSessionService.ts`, `services/container.ts`, and
`features/workout-logging/screens/ActiveWorkoutScreen.tsx` - a merge conflict when
both PRs land is expected and normal, not a bug in this plan. Whoever merges second
resolves it; not addressed further here.

## Affected layers

- **Domain** (`features/records/domain/`): `Estimated1RM.ts` (Epley/Brzycki, formula
  injected not imported, per ADR-0015 Decision 1), `ProgressionAdvisor.ts` (double
  progression per ADR-0015 Decision 2), `evaluateCandidateRecords.ts` (pure function:
  given the current `PersonalRecord[]` for an exercise plus a newly-completed
  eligible `workout_set`, returns which record types are beaten and their new
  values - kept pure and SQL-free so the equivalence test can drive it directly,
  mirroring how `setSemantics.ts`/`SetVolume.ts` keep P6's volume logic pure).
- **Repository/service** (`features/records/{repository,services}/`):
  `PersonalRecordRepository`/`SqlitePersonalRecordRepository` per ARCHITECTURE.md
  section 8.3's exact method list (`listCurrent`, `listRecent`, `evaluateAndUpsert`,
  `listHistory`, `rebuild`); `PersonalRecordService` (Zod-validated, the only door
  into the repository from presentation, same rule as every other feature service).
- **Read model** (`features/workout-logging/repository/`): `ExerciseHistoryRepository`
  / `SqliteExerciseHistoryRepository` per section 8.3 (`getPreviousPerformance`,
  `getBestPerformance`, `listRecentSessionsForExercise`) - lives in `workout-logging`
  per the architecture doc's own feature assignment, not in `records` (records/
  rest-timer must not depend on workout-logging; this is workout-logging's own
  read-model, not a dependency inversion).
- **workout-logging integration**: the set-completion path
  (`SqliteWorkoutSessionRepository`'s complete-set method) calls
  `records.evaluateAndUpsert` inside its own transaction (allowed direction:
  workout-logging depends on records) and populates `CompletedSetResult.newPRs`
  (currently `readonly never[]`) for real. `WorkoutSessionService.updateHistoricalSession`
  (P9 scope, not yet built) is NOT touched; instead, the two write paths that exist
  today and can retroactively change history - deleting a historical session and any
  future edit path - call `records.rebuild(affectedExerciseIds)`. Since P9 (session
  editing) is not built yet, this phase wires the rebuild call only where a write path
  already exists (session delete); a comment notes P9 must call it too when it lands.
- **UI**:
  - `ProgressionHint` + `PRBadge` (new, `features/records/components/`), consumed by
    `SessionExerciseCard`/`SetRow` inside `workout-logging` - `records` exposes them
    through its barrel, `workout-logging` imports from the barrel (allowed direction).
    `PRBadge` fires `services/haptics.personalRecord()` (already exists, never
    invoked - first real caller, same "first real caller" pattern P7's write-up used
    for `timerFinished()`).
  - `PreviousPerformancePanel` rewritten to consume
    `workout-logging`'s own `useExerciseHistory` hook - no cross-feature import
    needed, it already lives in `workout-logging`.
  - `ExerciseDetailScreen`'s two empty sections become real **slots**: the screen
    itself stays a dependency-free leaf (per ARCHITECTURE.md section 9.1's explicit
    "exercise-library must stay a dependency-free leaf" rule and its stated intent -
    "renders history and PR sections through slots the host route fills") - it gains
    two optional render-prop/children slots, and the host route
    (`app/(tabs)/exercises/[id].tsx`, which is NOT bound by the leaf rule) supplies
    the actual content using hooks from `records` and `workout-logging`. This is the
    same slot pattern the architecture doc already named for this exact screen; P4
    left it unimplemented because no consumer existed yet.
  - Profile: a "Personal records" section/row on `ProfileScreen` (`features/profile`
    does not gain a dependency on `records` internally either - same slot approach,
    or a thin `app/(tabs)/profile/index.tsx`-level composition; final call left to the
    implementing pass, consistent with the exercise-detail slot precedent).
  - Settings: "Recalculate records" action (calls `records.rebuild()` with a
    confirm dialog, since it is a real recompute over potentially thousands of rows)
    and a new `oneRm.formula`/`progression.upperIncrementKg`/
    `progression.lowerIncrementKg` settings screen (`app/profile/settings/
    progression.tsx`, mirroring the exact pattern P7 used for `timers.tsx`), reached
    from a new row on `SettingsScreen`.
- **No new npm dependency expected.**

## Domain decision needed during implementation (not a business-rule ambiguity, flagged for review not for user)

ADR-0015's increment rule says "applied when the exercise's primary muscle is an
upper-body group" / "lower-body group", but `muscle.body_part` in the actual schema
has seven values (`upper`,`lower`,`core`,`arms`,`back`,`shoulders`,`legs`), not a clean
binary. The domain pass must define an explicit mapping (e.g. `arms`/`back`/
`shoulders`/`core`/`upper` -> upper-body increment, `legs`/`lower` -> lower-body
increment) as a small named table in `ProgressionAdvisor.ts` with a comment stating the
mapping exists because the schema's categories don't line up 1:1 with the ADR's binary
language - not silently guessed inline. Step 6 code review checks this mapping is
defensible and documented, not that it matches some unwritten "correct" answer.

## Error handling strategy

- `evaluateAndUpsert` runs inside the caller's transaction (always, per the repository
  contract's own signature - it takes a required `tx`) - if the set-completion
  transaction rolls back, no partial PR write survives.
- `rebuild()` is idempotent and safe to re-run; it fully regenerates from
  `workout_set`, so a bug in the incremental path is provably recoverable rather than
  a silent permanent drift - this is the whole justification ADR-0015 gives for the
  cache existing, and the equivalence test is what keeps that claim honest.
- `Estimated1RM`/`ProgressionAdvisor` never throw - out-of-range or missing input
  returns `null`/a "first time" result, never an exception, per ADR-0015's explicit
  "silence is more honest than a wrong number" framing.
- Deleting an exercise that has personal records: `personal_record.exercise_id` is
  `ON DELETE CASCADE` per schema, so no orphaned rows and no code-level handling
  needed - verified against `schema.sql` directly, not assumed.

## Edge cases to address (Step 6a re-verifies against the actual diff)

System side: a set that ties an existing record (not exclusively beats it - does a tie
count? ADR-0015 doesn't say; default to "strictly greater beats it, a tie does not
create a new current record" and flag this as a documented judgment call, not a silent
guess, in the domain module's own comment); an exercise with zero history evaluated for
the first time; `rebuild()` invoked mid-app-use while a workout is active (must not
lock the set-completion path); very large history (the 2,500-session/75,000-set
performance fixture from P2 - `rebuild()` and the equivalence test should run against
it, not a toy fixture, matching ADR-0014's benchmark convention); an exercise with
sets in more than one unit conversion context (weight is always stored in kg per
ADR-0009 - no unit-conversion-boundary risk here, but worth a defensive test).

Human side: a user who hits a PR on their very first-ever set of an exercise (no
"previous" to beat, but every record type is trivially a new current record - correct
behavior, not a bug); a user who completes an `assisted` set expecting a badge and gets
none (matches D-02's exclusion, but the UI must not look broken - no dead space, a
clean absence); a user who deletes the session that held their only PR for an exercise
(the PR list for that exercise goes empty, not stale); a user who changes
`oneRm.formula` mid-session (existing displayed e1RM values should reflect the new
formula on next render, not require an app restart - `oneRm.formula` is read at render
time via the settings hook, never cached).

## Agent delegation plan

| Step | Agent | Files owned | Parallel/Sequential |
|---|---|---|---|
| Pass 1: domain calculators + tests | frontend-agent | `features/records/domain/**`, `features/records/types/**`, `features/records/index.ts` (barrel), their `__tests__/**` counterparts | Sequential, first |
| Pass 2: records repository/service + workout-logging read-model + set-completion integration + tests | frontend-agent | `features/records/repository/**`, `features/records/services/**`, `features/workout-logging/repository/{ExerciseHistoryRepository.ts,SqliteExerciseHistoryRepository.ts}` (new), edits to `features/workout-logging/repository/{WorkoutSessionRepository.ts,SqliteWorkoutSessionRepository.ts}` (set-completion PR eval call, `CompletedSetResult.newPRs`, session-delete rebuild call), `features/workout-logging/services/WorkoutSessionService.ts`, `services/container.ts` (add `records`/`history` to `AppContainer`), their `__tests__/**` counterparts including the incremental-vs-rebuild equivalence test | Sequential, second (depends on pass 1's pure calculators) |
| Pass 3: UI - components, screen slots, settings screens | frontend-agent | `features/records/components/**` (`ProgressionHint`, `PRBadge`), `features/records/hooks/**`, `features/records/screens/**` (profile PR list content if it needs its own screen module), edits to `features/workout-logging/components/PreviousPerformancePanel.tsx` and `SessionExerciseCard.tsx`/`SetRow.tsx` (PR badge/hint wiring), edits to `features/exercise-library/screens/ExerciseDetailScreen.tsx` (slot props only - no cross-feature import added inside the feature itself), `app/(tabs)/exercises/[id].tsx` (fills the new slots), `features/profile/screens/{SettingsScreen.tsx,ProfileScreen.tsx}` (new rows), new `features/profile/screens/ProgressionSettingsScreen.tsx` + `app/profile/settings/progression.tsx`, `navigation/routes.ts` (new route helper), `i18n/catalogs/en.ts` (new strings) | Sequential, third (depends on pass 1 + pass 2 contracts) |
| Test coverage gaps after all three passes | test-agent | any new code the three passes didn't already cover; explicit focus on the equivalence test's fixture scale | Sequential, after pass 3 |
| Code review | orchestrator (this session) | read-only over the full diff | After test-agent |
| Security review | security-agent-sonnet | read-only - no new endpoints/auth surface, but `rebuild()` is a bulk-recompute action reachable from Settings, worth a routine look at whether it can be triggered destructively or DoS the UI thread | After code review |
| Accessibility review | accessibility-agent | read-only - `PRBadge`, `ProgressionHint`, the new progression settings screen, the profile PR list | Parallel with security review (both read-only, no file conflict) |
| Docs | docs-agent | `CLAUDE.md`, `docs/architecture-snapshot.md` (stale since the P6 docs commit - regenerated here) | After security/accessibility |
| Commit | git-commit-agent | staged per logical group | After docs |

## Feature flags / NFR decisions

No feature-flag system exists in this project (unchanged from every prior phase's
check) - not raised further.

NFR: none newly surfaced by Step 0 beyond what ADR-0015 already pins down (the
rebuild-as-safety-net pattern is the concrete answer to "what if the cache is wrong",
already a chosen pattern, not left implicit).
