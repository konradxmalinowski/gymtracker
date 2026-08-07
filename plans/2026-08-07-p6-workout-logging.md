# P6 - Workout logging

Branch: `feat/p6-workout-logging` (off `main` at `141d884`, fast-forwarded from a
9-commit-stale local `main` before branching - P5 and the SDK-alignment chore are
confirmed merged into `origin/main`).

## Problem summary

Implement docs/ROADMAP.md's P6 in full: the active workout screen and everything
that makes logging a set crash-safe. This is the hub feature of the app - nothing
before it (plans, exercise library) depends on it, but almost everything after it
(rest timer, records, statistics, calendar, home, data-transfer) depends on
`workout-logging` existing.

## Acceptance criteria (verbatim from ROADMAP.md, this phase's contract)

- E2E flow 4 (blocking): log 4 sets, force-kill the process, relaunch - resume
  prompt appears, all 4 sets present with correct values.
- A set is completable in two taps from a pre-filled row, with no keyboard.
- Starting a second workout while one is active is prevented by the database and
  handled gracefully in the UI.
- Swipe-delete plus undo restores the set with its original id.
- The SQL view (`v_working_set`) and the TypeScript volume calculator agree across
  the generated matrix of set types and values.
- 20 exercises with 5 sets each scrolls at 60 fps.

Per ROADMAP.md's Definition of Done, on-device confirmation of these criteria is
deferred to the single batched pass after P10 (confirmed with the user - see
"Decisions" below). This phase closes on automated gates: typecheck, lint,
repository/domain tests, code review, security review. No physical
device/simulator is available in this session; `npx expo export --platform ios` is
used again as the build-verification proxy, same as P4 and P5.

## Explicit non-goals for this phase (deferred by the roadmap, not by omission)

- Rest timer bar and any timer starting/scheduling - P7. Completing a set saves
  and vibrates but starts no timer. `active_session_state`'s timer columns stay
  NULL in this phase.
- Progression suggestions (`ProgressionAdvisor`) - P8. The previous-performance
  panel shows only previous values, no suggestion.
- Personal record evaluation - P8. `completeSet`'s `CompletedSetResult` always
  returns an empty `newPRs` array in this phase; `PersonalRecordRepository` does
  not exist yet and is not imported. `personal_record` and its unique index
  already exist in the schema (P2) but stay untouched until P8 extends the same
  transaction.
- The workout summary screen (`app/workout/summary/[sessionId].tsx`) - P9's
  scope per ROADMAP.md. See "Decisions" below for what `finish` does instead.

## Task shape and scale

Single application (Expo/React Native, offline-only, no backend/server). One
feature phase spanning two layers within that one app:
- A persistence/business-logic layer (domain calculators, `WorkoutSessionRepository`,
  `WorkoutSessionService`, crash-recovery boot-gate logic) - routed like backend
  work per the routing table, even though it runs on-device against SQLite rather
  than a remote server.
- A presentation layer (Zustand store, hooks, screens, components, gesture
  interactions) - routed to frontend-agent.

No database-agent needed: every table this phase writes to (`workout_session`,
`session_exercise`, `workout_set`, `active_session_state`) and the `v_working_set`
view already exist from P2's schema (verified directly in `database/schema.sql`).
Zero new migrations.

These two layers are tightly coupled (screens consume the repository's aggregate
types and the service's mutation contracts directly), so this runs **sequentially**,
not in parallel, per the Step 4a rule against parallelizing dependent sub-tasks.

Platform: React Native/Expo, iOS + Android, no web surface. Per the checklist's own
carve-outs: SEO (9b), LLM/AI-agent accessibility (9d), and human accessibility (9e,
WCAG is a web/ICT standard) all skip - platform-native accessibility (VoiceOver/
TalkBack labels, 44x44 targets, RNTL a11y assertions) stays an implementation-level
responsibility of frontend-agent, matching how P3-P5 already did it (no separate
accessibility-agent invocation in this project's history; P4/P5's
`reports/accessibility-*.md` were produced by the implementing agent as part of its
own deliverable). DevOps/infrastructure (9c) skips - no new env vars, CI config, or
cloud resources. Security review (Step 9) does apply - this phase touches database
queries substantially (a new aggregate-root repository, transactional writes) -
`security-agent-sonnet`, matching the routine-tier review P4 and P5 each got.

## Decisions (surfaced to the user, confirmed before writing this plan)

1. **Full P6 scope as specified in the roadmap** - confirmed, no reduction or
   expansion.
2. **On-device crash-safety confirmation stays deferred** to the batched post-P10
   pass, per the roadmap's own Definition of Done - confirmed. This phase's E2E
   flow 4 is exercised as a repository/service-level integration test (start a
   session, complete sets, simulate a fresh process by re-hydrating a new
   repository instance from the same underlying database file, assert full
   recovery) rather than a live Maestro run against a device.
3. **Crash-recovery boot mechanism** - confirmed: extend the existing root boot
   gate (`app/_layout.tsx`'s `RootNavigationGate`, which already redirects to
   `/onboarding` when there's no profile) to also check the MMKV `session.active`
   flag and call `sessions.findInProgress()`. A fresh in-progress session
   redirects straight into `/workout/active` (which hydrates `activeWorkoutStore`
   from the DB and renders the real sets - satisfying "relaunch shows the resume
   prompt and all 4 sets"). A stale session (`started_at` older than
   `workout.staleAfterHours`, a setting that already exists,
   `repositories/settings/settingsSchema.ts`) shows a finish-or-discard
   `ConfirmDialog` instead of silently resuming, per ADR-0005 item 7. P10 later
   adds the Home dashboard's polished "Resume workout" banner card as a second,
   more discoverable entry point into the same underlying mechanism - not a
   conflict, an addition.
4. **`finish` navigates to Home, not a summary screen.** `app/workout/summary/
   [sessionId].tsx` is explicitly P9 scope in ROADMAP.md. `WorkoutSessionService
   .finish()` still computes and denormalizes the real totals (duration, volume,
   set count, rep count) onto `workout_session` per ADR-0005/6.2's `SessionTotals`
   calculator, and `PersonalRecordRepository`/PR badges stay out per the P8
   deferral above - but the UI action after finishing is `router.replace
   (routes.tabs.home())`, the same "replace, not push" rule ADR-0007 specifies for
   the summary route, just pointed at Home until P9 exists to redirect through a
   real summary screen instead. This mirrors how P4 shipped genuinely empty
   performance sections rather than blocking on P8: the data is computed and
   correct now, the screen that best presents it lands later.
5. **Discard** also replaces to Home, gated by the existing `workout.confirmDiscard`
   setting (already in the settings schema) driving whether a `ConfirmDialog`
   appears first.

## Affected layers

Domain, repository, service/store, presentation (screens/components/hooks),
navigation/routing, root boot gate. No auth (offline single-user app). No new
third-party packages - Reanimated, Gesture Handler, Zustand, TanStack Query, Expo
SQLite are already installed and used by prior phases.

## API contracts (fixed before delegation, per Step 4c)

### `WorkoutSessionRepository` (`features/workout-logging/repository/WorkoutSessionRepository.ts` +
`SqliteWorkoutSessionRepository.ts`), scoped to what P6 actually needs (the full
literal surface is ARCHITECTURE.md section 8.3's list; PR-related return values are
stubbed per the P8 deferral above):

```
findInProgress(): Promise<ActiveSessionAggregate | null>
startFromPlanDay(planDayId, startedAt): Promise<ActiveSessionAggregate>
startEmpty(startedAt): Promise<ActiveSessionAggregate>
addExercise(sessionId, exerciseId, atIndex?): Promise<SessionExercise>
removeExercise(sessionExerciseId): Promise<void>       // soft delete, undo toast
restoreExercise(sessionExerciseId): Promise<void>
reorderExercises(sessionId, orderedIds): Promise<void>
setSupersetGroup(sessionExerciseIds, group | null): Promise<void>
appendSet(sessionExerciseId, seed: SetSeed): Promise<WorkoutSet>   // pre-filled from the previous set, FR-11
updateSet(setId, patch): Promise<WorkoutSet>
completeSet(setId, values): Promise<CompletedSetResult>   // CompletedSetResult.newPRs is always [] in P6
uncompleteSet(setId): Promise<WorkoutSet>
addDropSet(parentSetId, seed): Promise<WorkoutSet>
deleteSet(setId): Promise<void>                        // soft delete, undo toast, restores with original id
restoreSet(setId): Promise<void>
saveActiveState(patch: ActiveStatePatch): Promise<void>  // focus, scroll - timer fields unused until P7
finish(sessionId, finishedAt): Promise<SessionSummary>   // denormalizes SessionTotals; no PR/summary-screen coupling
discard(sessionId): Promise<void>
```

Constraint handling: starting a second session while one is `in_progress` must
surface `ux_session_single_in_progress`'s violation as a typed repository error
(mirroring `features/plans/repository/errors.ts`'s pattern) that the service
translates into "resume or discard the existing session" - never a raw SQLite
error reaching the UI.

### Domain calculators (`features/workout-logging/domain/`, zero React/RN/Expo
imports - domain purity is ESLint-enforced)

- `SetVolume.ts`: `volume(set: { setType, weightKg, reps }): number`, implementing
  ADR-0006's semantics table exactly (warmup/assisted/partial -> 0). Must be tested
  for agreement with `v_working_set`'s `volume_kg` CASE expression across a
  generated matrix - this is a named, non-optional acceptance criterion.
- `SessionTotals.ts`: duration/volume/set-count/rep-count from a session's working
  sets - the pure function `finish()` denormalizes from.
- `formatSetNumbering` or equivalent for drop-set display numbering (ADR-0006:
  "set_index is not incremented for drop segments; handled once, in the set-list
  view model") - domain-layer pure function, not scattered in components.

### `activeWorkoutStore` (Zustand, `stores/activeWorkoutStore.ts`) - the one ADR-0008
exception store

- Hydrated from `WorkoutSessionRepository.findInProgress()` on mount only.
- Every edit updates the store synchronously and dispatches a repository write
  through `WorkoutSessionService` - store never corrects the database, only the
  reverse.
- Cleared on finish/discard/unmount; `hooks/invalidation.ts`-style explicit
  invalidation of any relevant query keys at that point (there isn't much to
  invalidate yet since `plans`/`exercises` already have their own query keys and
  P6 doesn't introduce read-model queries beyond the active session itself).
- Consumed only through selectors, never the bare hook (ADR-0008 store inventory
  rule) - same discipline `exercisePickerStore` and `uiStore` already follow.

### Routing (`navigation/routes.ts` additions)

```
workout: {
  active: (): Href => '/workout/active',
}
```

`app/workout/_layout.tsx` (Stack, `presentation: 'fullScreenModal'`,
`gestureEnabled: false`, `animation: 'slide_from_bottom'`, Android back
intercepted) and `app/workout/active.tsx` (thin wrapper into
`features/workout-logging/screens/ActiveWorkoutScreen`, per the "app/ never
contains screen bodies" rule). `app/workout/summary/` is not created in this
phase - P9's job.

### Screens/components (`features/workout-logging/screens/`, `.../components/`)

`ActiveWorkoutScreen` composed per ARCHITECTURE.md section 10.3: `WorkoutHeader`
(elapsed timer, title, Minimize, Finish), `FlashList<SessionExerciseCard>`
(`ExerciseHeader` with superset bracket/note/overflow, `PreviousPerformancePanel`
showing previous values only - no suggestion per the P8 deferral, `SetRow[]`,
`DropSetGroup` rendered inline under its parent, `AddSetButton` pre-filling from
the last set), `QuickAdjustBar` (context-sensitive to the focused set: -1/+1 rep,
+/-1.25/2.5/5/10 kg per FR-12, press-and-hold acceleration), `AddExerciseButton`
reusing the existing `(modals)/exercise-picker` route and `exercisePickerStore`
exactly as `PlanDayEditorScreen` already does (per `navigation/routes.ts`'s own
comment: "meant to be reused later by the active-workout screen's own 'Add
exercise' action (P6)"). `ActiveWorkoutBanner` mounted at the tab-bar level
(`app/(tabs)/_layout.tsx`) for the minimize case, per ADR-0007 rule 2. `SetRow`
built on the existing `SwipeableRow` primitive (left action = delete-with-undo,
right action = toggle inline expand for editing - never a modal, per ADR-0007
rule 4). Start flows: from a plan day (via `routes.plans.day`'s existing screen
gaining a "Start workout" action) and Quick Start (empty session).

## Edge cases (Step 6a, pre-declared so delegated agents build for them, not
retrofit them)

System side:
- Two devices/tabs racing to start a session simultaneously -> DB constraint
  wins, service surfaces "resume or discard."
- App killed mid-transaction (between `UPDATE workout_set` and
  `UPDATE active_session_state`) -> `synchronous=FULL` plus one transaction per
  mutation (ADR-0005) means either both commit or neither does; no torn state.
- Deleting the last exercise in a superset group -> group renumbers or clears to
  standalone, never leaves a dangling `superset_group` value referencing a group
  of one.
- Force-completing a set with `reps` or `weight_kg` outside the schema's `CHECK`
  bounds -> validated by the service before the write, not left to surface as a
  raw constraint violation.
- Stale in-progress session (`workout.staleAfterHours` exceeded) on cold boot ->
  finish-or-discard prompt per decision 3 above, not a silent resume reporting a
  double-digit-hour duration.
- 20 exercises x 5 sets scroll performance -> `FlashList` on exercise cards per
  section 10.3, plain mapped list for sets within a card (nested virtualization
  explicitly rejected in the architecture doc).

Human side:
- Double-tapping the complete checkbox -> idempotent; second tap is a no-op or
  toggles to uncompleted, never creates a duplicate completion record.
- Swiping to delete a set, then immediately swiping to delete the undo toast's
  parent exercise -> the set's soft-delete and its undo capability survive the
  exercise-level operation ordering; `deleteSet`/`restoreSet` and
  `removeExercise`/`restoreExercise` are independent soft-delete lifecycles.
- Backgrounding mid-set-edit (inline expanded row) -> the expanded value is only
  committed on explicit confirmation, not on backgrounding; if the user returns,
  the field state is whatever was last typed, not silently lost or silently
  saved.
- User taps Minimize then immediately force-quits -> already covered by the
  per-mutation-commit model; nothing is pending in memory that only Minimize
  would have flushed.
- Screen-reader user operating `SetRow`'s swipe actions -> per
  `SwipeableRow`'s existing `accessibilityActions`/`onAccessibilityAction`
  pattern (already built in P1, exercised again in P5's `DraggableList` fix) -
  delete and expand must both be reachable without a swipe gesture.

## Agent delegation plan

**Step 1 (sequential): backend-agent-opus** - complex/high-blast-radius tier,
matching the routing table's own criterion ("architectural changes... high blast
radius") for what ARCHITECTURE.md itself calls "the most important surface in the
app."

Owns:
- `features/workout-logging/domain/**`
- `features/workout-logging/repository/**`
- `features/workout-logging/services/**`
- `features/workout-logging/types/**`
- `features/workout-logging/index.ts` (barrel)
- `services/container.ts` (extend `AppContainer` with `sessionRepository`/
  `sessionService`, following the exact pattern `planRepository`/`planService`
  already established - never replace existing members)
- `repositories/settings/` - read-only consumer of `workout.staleAfterHours`/
  `workout.confirmDiscard`, no schema changes expected

Forbidden: `features/workout-logging/{components,hooks,screens}/**`, `stores/**`,
`app/**`, `navigation/routes.ts`, any other feature's files.

Contracts: the repository/service method signatures and domain calculator
signatures listed above are fixed inputs, not proposals - matching them exactly is
what lets frontend-agent start from a known contract.

**Step 2 (sequential, after Step 1's report is reviewed): frontend-agent**

Owns:
- `features/workout-logging/{components,hooks,screens}/**`
- `stores/activeWorkoutStore.ts`
- `app/workout/**` (thin wrappers only)
- `app/(tabs)/_layout.tsx` (add `ActiveWorkoutBanner` mount point only - minimal
  diff, not a restructure)
- `app/_layout.tsx` (extend `RootNavigationGate` per decision 3 - minimal diff)
- `navigation/routes.ts` (add the `workout.active` entry only)

Forbidden: `features/workout-logging/{domain,repository,services,types}/**`,
`services/container.ts`, any other feature's files.

Contracts: consumes exactly the repository/service/domain exports Step 1
produces - if a needed method or type is missing, that is a blocker to report
back, not something to route around by reaching past the service layer (the "no
direct repository access from presentation" ESLint rule would fail lint anyway).

## NFR decisions

- NFR-01 (set completion <= 100ms perceived, no `await` on the render path): the
  ADR-0008 exception pattern (optimistic Zustand update first, repository write
  dispatched by the service afterward, reconcile-from-DB on failure) is the chosen
  pattern - not a new one, already accepted in ADR-0008/section 5.1.
- NFR-04-adjacent (20 exercises x 5 sets at 60fps): `FlashList` for the exercise
  list, plain mapped children for sets, matching section 10.3's explicit
  rejection of nested virtualization.
- NFR-05 (durability): `synchronous=FULL` + WAL is already the DB-wide pragma
  configuration from P2 - no new configuration needed, just correct transaction
  boundaries in the new repository.

## Feature-flag decision

Not applicable - the project has no feature-flag system (confirmed by CLAUDE.md's
stack list and prior phases' plans).

## Verification plan (Steps 6-9)

1. Code review scoped to the two agents' diffs, including the design-patterns
   cross-check (the session-as-committed-row pattern from ADR-0005 is the
   opposite of a premature abstraction - it removes a translation layer other
   options would have added) and the edge cases above.
2. `tsc --noEmit`, `eslint`, `prettier --check` clean.
3. `npx expo export --platform ios` as the build-verification proxy (no
   simulator/emulator available this session, flagged not silently skipped, same
   as P4/P5).
4. Jest: domain property tests for `SetVolume`/`SessionTotals`, the
   `v_working_set`-vs-calculator agreement test, `SqliteWorkoutSessionRepository`
   integration tests against real `schema.sql` via `NodeSqlExecutor` including
   constraint-violation and rollback paths (Definition of Done requirement) and a
   crash-recovery-equivalent test (fresh repository instance over the same
   underlying data reconstructs the full aggregate), RNTL tests for `SetRow`/
   `QuickAdjustBar`/the swipe-gesture accessibility actions.
5. `security-agent-sonnet` review (new aggregate-root repository, substantial new
   queries) -> `reports/security-2026-08-07-p6.md`.
6. `docs-agent` updates `CLAUDE.md`, `docs/architecture-snapshot.md` (P6 status),
   and `CHANGELOG.md` (project already has one, per Step 2's detection).

## Commit plan (Step 11, thematic, matching P4/P5's established pattern)

1. `feat: add workout session domain calculators and set-volume semantics`
2. `feat: add workout session repository with crash-safe transactional writes`
3. `feat: add workout logging application layer and active workout store`
4. `feat: add active workout screen with set logging and gesture interactions`
5. `feat: add crash-recovery boot gate for in-progress workout sessions`
6. `test: add coverage for workout session repository and domain calculators`
   (if not already folded into the above by the implementing agents)
7. `docs: document p6 workout logging phase and security review`

Exact split confirmed against the real diff at commit time - this is the expected
shape, not a rigid requirement if the actual changes group differently.
