# ADR-0005: The in-progress workout is a committed database row, not a draft

- Status: accepted
- Date: 2026-08-04

## Context

FR-19: "If the application closes unexpectedly, the in-progress workout must be
recoverable." The brief lists this under UX principles alongside "auto-save
frequently", which understates it - this is the requirement that decides whether a user
trusts the app. Losing a logged workout once is uninstall-grade.

The failure modes to survive, in increasing severity:

1. The user backgrounds the app and the OS reclaims it (routine on Android, common on
   iOS after 10+ minutes with the camera or another heavy app in front).
2. The app crashes from a JS or native error mid-workout.
3. The OS or device crashes / battery dies.

## Options considered

**A. Keep the workout in Zustand, persist to MMKV on change (debounced).**
The common React Native pattern. Fast, simple. Rejected: MMKV writes are synchronous
but the debounce window loses the most recent set on a crash; the serialized blob has
no schema, no constraints and no relationships, so it has to be re-validated and
re-mapped into the real tables on finish - which is a second, divergent write path for
the same data. Two write paths for the same entity is exactly how "finished workouts
sometimes lose their last exercise" bugs happen.

**B. Keep the workout in Zustand, persist a JSON draft to SQLite in one column.**
Same problem as A with extra steps. The draft is opaque to SQL, so nothing can query
it, and the finish operation is still a translation.

**C. Write the workout into its real tables from the moment it starts, with
`status = 'in_progress'`, and commit on every mutation.** **Chosen.**

**D. Option C plus a write-ahead journal of user intents (event sourced).**
Maximum recoverability, including recovering a set the user was mid-edit on. Rejected:
the incremental recovery it buys over C is a single partially-typed field, at the cost
of a projection layer over every read.

## Decision

There is no draft. **The active workout is a normal `workout_session` row with
`status = 'in_progress'`, and its exercises and sets are normal rows in
`session_exercise` and `workout_set`.** Finishing a workout is an `UPDATE` that sets
`status = 'completed'`, `finished_at` and the denormalized totals. It is not a
migration from one storage form to another.

Supporting mechanisms:

1. **Per-mutation commits.** Adding an exercise, appending a set, editing a value and
   completing a set each commit their own transaction. There is no "save" button and no
   batching window.

2. **`PRAGMA synchronous = FULL` alongside `journal_mode = WAL`.**
   WAL alone with the usual `synchronous = NORMAL` can lose the last transactions on an
   OS crash or power loss (failure mode 3), though not on an app crash. `FULL` forces an
   fsync per commit. The usual argument against it is throughput, and it does not apply
   here: this app commits on the order of once per completed set, a handful of times a
   minute. Paying a few milliseconds of fsync per set to make failure mode 3 survivable
   is the correct trade for a hard functional requirement.

3. **A partial unique index makes two active workouts impossible:**
   ```sql
   CREATE UNIQUE INDEX ux_session_single_in_progress
       ON workout_session (status) WHERE status = 'in_progress';
   ```
   Starting a second workout while one is open fails at the database, not at a
   `useEffect`. The service catches the constraint violation and offers to resume or
   discard the existing one.

4. **`active_session_state`** holds the volatile screen and timer state that does not
   belong on the domain rows: the rest timer's absolute deadline, the scheduled
   notification id, the focused exercise, the scroll offset. Written on the same
   transaction as the set completion that started the timer.

5. **The rest timer is an absolute deadline, never a countdown.** `timer_deadline_at`
   is an epoch millisecond value. The UI renders `deadline - now()` on every frame and
   on every foreground event. Process death, backgrounding and Doze therefore cannot
   desynchronize it - there is no interval to lose.

6. **An MMKV boolean `session.active`** lets the splash gate decide whether to look for
   a session before SQLite is even open, keeping cold start under NFR-02. It is a cache:
   when it disagrees with the database, **the database wins** and the flag is corrected.

7. **Stale session policy.** If an `in_progress` session's `started_at` is older than
   `workout.staleAfterHours` (default 12), the resume prompt becomes finish-or-discard
   rather than a silent resume, so a workout forgotten overnight does not report a
   14-hour duration.

## The UI does not wait on the database

This is what makes the decision compatible with NFR-01 (log a set in 2-3 seconds).
Tapping the complete checkbox updates the Zustand store synchronously and renders
immediately; the repository write is dispatched and awaited by the service, not by the
component. If it fails, the store is reconciled from the database and a toast is shown.
The sequence is specified in ARCHITECTURE.md section 5.1.

## Consequences

Positive:
- There is exactly one representation of a workout, so there is exactly one write path
  and one set of constraints. The class of "the draft and the saved version disagree"
  bugs cannot occur.
- Recovery is a `SELECT`, not a deserialization. It cannot fail on a schema change,
  because migrations apply to it like any other row.
- An in-progress workout is queryable, so the Home banner, the tab-bar indicator and
  the stale-session check are all trivial queries.

Negative:
- Every read that aggregates history must exclude `status <> 'completed'`, or an
  in-progress workout pollutes statistics. Handled structurally: the `v_working_set`
  view filters on `status = 'completed'`, and statistics never touch the base table.
- `synchronous = FULL` costs an fsync per commit. Measured budget: under 5 ms per set
  on a mid-range Android device. If the benchmark at P15 shows worse, the fallback is
  `NORMAL` plus an explicit `wal_checkpoint(PASSIVE)` after each completed set, which
  keeps failure mode 2 covered and weakens only failure mode 3.
- A discarded workout leaves a row with `status = 'discarded'` rather than vanishing.
  Intentional - it makes "I discarded that by accident" recoverable - but it means the
  purge operation has to know about it.

## Verification

E2E flow 4 in ARCHITECTURE.md section 14.4 is mandatory and blocking: start a workout,
complete four sets, force-kill the process, relaunch, assert all four sets are present
with correct values and the resume prompt appears. This test is the acceptance criterion
for FR-19 and runs on every release candidate.
