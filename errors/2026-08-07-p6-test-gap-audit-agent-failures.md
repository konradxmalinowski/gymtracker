# P6 test-agent-opus gap audit - repeated agent failures

Date: 2026-08-07
Branch: `feat/p6-workout-logging`
Related plan: `plans/2026-08-07-p6-workout-logging.md`

## What was being attempted

Step 8 of the implement-feature workflow: after backend-agent-opus and
frontend-agent's passes were both complete, reviewed, and independently
verified (84 suites / 755 passing / 1 pre-existing skip, confirmed by
`tsc --noEmit` / `eslint` / `jest` re-runs in this session, not just agent
self-reports), a supplementary test-agent-opus pass was dispatched. Its scope
was a targeted gap audit, not a rewrite: check for under-covered concurrency/
race-condition edge cases in `WorkoutSessionRepository` (the
`ux_session_single_in_progress` race, interleaved-mutation TOCTOU gaps in
`finish`, the crash-recovery equivalence test's fidelity, drop-set cascade
assertions, the newly added `setExerciseNote`/`setSessionNotes` transaction
composability, and a Definition-of-Done sweep for missing constraint-violation
tests across all 19 repository methods).

## What happened

1. First launch: failed after 16 tool calls / ~193s with "Agent terminated
   early due to an API error: You've hit your session limit - resets 3pm
   (Europe/Warsaw)." Partial recovered output showed it had only just started
   probing concurrency behaviors empirically - no findings, no tests written.
2. Resumed once (per the workflow's one-resume-before-escalating rule),
   restating the full original scope. It ran further this time - reached
   "ESLint clean... Full suite now" in its result field, suggesting it was
   mid-way through a final verification pass - but then failed again:
   "Agent stalled: no progress for 600s (stream watchdog did not recover)."

Two failures on the same subtask. Per this project's escalation rule (an
agent failing the same subtask twice means stop, record it, and ask the user
- not retry indefinitely), no further automatic resume was attempted.

## Current state - nothing is broken or blocked

This audit pass never modified any file (its brief explicitly forbade
touching repository/service production code, and it hadn't reached the
test-writing stage before either failure). `git status` on
`feat/p6-workout-logging` is unaffected by these two agent runs - there is
nothing to revert. The branch's actual test suite (84 suites / 755 passing /
1 skip) is exactly as it was before this audit was dispatched, independently
re-verified in this session multiple times across the whole P6 implementation,
not just at this step.

## Resolution (post-decision update)

The user chose option 1 (skip the audit, proceed to Step 9). However, while
verifying the working tree before Step 10 (docs), two test files were found
that the failed agent had actually written before the stream-watchdog stall
killed it, timestamped after its resume: `__tests__/features/workout-logging/
repository/SqliteWorkoutSessionRepository.concurrency.test.ts` and
`.../SqliteWorkoutSessionRepository.constraints.test.ts`. It never reached the
point of reporting them back, so they were sitting unreviewed in the tree.

Checked before deciding what to do with them:
- Confirmed no production file was touched (repository/service file mtimes
  all predate the audit agent's run by hours).
- Ran both files in isolation: 27/27 passing.
- Read both files in full: genuinely on-target, high-value coverage - an
  overlapping-`startEmpty`/`startFromPlanDay` concurrency suite proving the
  losing transaction leaves zero orphaned rows (not just "no session row"),
  a "mutation arrives after another writer already deleted the row" suite,
  drop-set cascade independence assertions on raw `deleted_at` columns, and
  - the most valuable one - a real file-backed crash-recovery test that
  actually closes and reopens the SQLite connection (`beforeCrash.close()` /
  reopen a fresh `NodeSqlExecutor` over the same file), which is materially
  stronger evidence for FR-19/ADR-0005 than the in-memory equivalence test
  the main implementation pass wrote.

Decision: kept both files rather than discarding salvageable, passing,
production-code-untouched test coverage. Final suite: 86 suites / 782 passing
/ 1 pre-existing skip (up from 84/755), independently re-verified with a full
`tsc --noEmit` / `eslint .` / `jest` run in this session. This is noted here,
not silently folded in, so the branch's history is honest about where this
coverage came from.

## Decision needed from the user (original, now resolved above)

Both P6 implementing agents already wrote extensive tests as part of their
own delivery, including: the `v_working_set`-vs-`SetVolume` equivalence
matrix, double-start constraint-violation/rollback assertions, all three
`appendSet` prefill tiers, drop-set parent/child integrity, independent
soft-delete lifecycles for both sets and exercises, a crash-recovery
equivalence test (fresh repository instance over the same DB reconstructing
the full aggregate), and - after a follow-up pass - note read/write/clear/
validation/not-found coverage for the two methods added post-review. This
supplementary audit was a "does a standard pass miss anything at the
race-condition/TOCTOU level" check, not a response to a known gap.

Options:
1. **Skip this supplementary audit and proceed to Step 9 (security review)**
   with the test coverage as it stands. Recommended given the coverage already
   in place is substantial and independently re-verified multiple times in
   this session; the specific things this audit was hunting for (a TOCTOU
   window in `finish()`, an incomplete crash-recovery equivalence test) are
   speculative gaps, not gaps anyone has actually observed a symptom of.
2. **Retry the audit from scratch** (not a third resume of the same stalled
   agent - a fresh dispatch) and accept the extra time/token cost.
3. **Something else** - e.g. narrow the audit's scope further, or have you
   look at specific methods yourself.
