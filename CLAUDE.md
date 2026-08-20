# CLAUDE.md

Read this before touching this repo. Full depth lives in `docs/ARCHITECTURE.md`,
`docs/ROADMAP.md`, and `docs/adr/*` - this file is a distilled, machine-readable
reference, not a replacement. Section numbers below refer to `docs/ARCHITECTURE.md`.

## Status

P0 (project foundation), P1 (design system and UI primitives), P2 (persistence
foundation), P3 (onboarding, profile and core settings), P4 (exercise library), P5
(workout plans), P6 (workout logging), P7 (rest timer), P8 (progressive overload and
personal records), P9 (workout summary and history), P10 (home dashboard), P11
(statistics and charts), and P12 (training calendar) are complete - `docs/ROADMAP.md`'s
MVP line closed at P10, and P11-P12 are the first two phases past it (v1.1-v1.3,
"Statistics, calendar, body metrics, data transfer"). P8
(`feat/p8-progressive-overload`) was cut from
`main` before P7's PR merged - a documented decision made when P8 was kicked off so
the two phases could be reviewed independently (see
`plans/2026-08-11-p8-progressive-overload.md`'s "Branch note") - so the two branches'
overlapping files (`WorkoutSessionRepository.ts`/`SqliteWorkoutSessionRepository.ts`,
`WorkoutSessionService.ts`, `services/container.ts`, `ActiveWorkoutScreen.tsx`, plus
this file and `docs/architecture-snapshot.md`) needed a merge; that merge is reflected
throughout this file as of this update, not left as an open branch note. The
`onboarding`, `profile`, `exercise-library`, `plans`, `workout-logging`, `rest-timer`,
`records`, `home`, `statistics`, and `calendar` features now have real implementations
(screens, hooks, services, repository where applicable - `rest-timer` itself owns no
database table and therefore no repository; `records` does, see below; `home`,
`statistics`, and `calendar` each have a repository but no accompanying service, see
below); the remaining two features (`body-metrics`, `data-transfer`) are still empty
skeleton directories (components/hooks/screens/services/domain/repository/types/
index.ts subfolders, no implementation) awaiting their own phase.

The app now boots for real: `app/_layout.tsx` opens the database, runs migrations,
seeds the exercise catalog (`database/seed/runSeed()`, idempotent - a P2 gap fixed in
P4, see below), builds the `AppContainer`, holds the splash screen until the profile
query resolves, then gates to `/onboarding` (no profile yet) or the tab bar.
`app/index.tsx` no longer exists - the Home screen moved to `app/(tabs)/index.tsx`
under a 5-tab layout (`app/(tabs)/_layout.tsx`: Home, Plans, Exercises, Stats,
Profile) using `@expo/vector-icons` (Ionicons; see "Known gaps" history below - this
resolved the prior no-icon-library gap). Every tab now renders real content - Plans
joined Exercises as a real nested Stack navigator in P5, Stats joined them in P11 (see
below); none of the five tabs render a "not built yet" placeholder any longer.
Onboarding (`app/onboarding/index.tsx` + `features/onboarding/*`) collects a required
nickname and an optional avatar via `expo-image-picker`, is skippable, and handles
permission denial gracefully. All navigation goes through the typed helpers in
`navigation/routes.ts` (ARCHITECTURE.md section 10.2) rather than raw string paths.

The Exercises tab (`app/(tabs)/exercises/`) is a real nested Stack navigator (list ->
detail -> create/edit) as of P4 - `app/(tabs)/_layout.tsx`'s tab registration changed
from `name="exercises/index"` to `name="exercises"` to route through
`app/(tabs)/exercises/_layout.tsx` rather than bypassing it. The library screen
(`ExerciseLibraryScreen`) offers instant FTS5 search that is diacritic-folded (e.g.
"lezac" matches "leżąc"), a multi-select filter sheet (muscle, equipment, body part,
level, gym/home context, favorites - OR within a category, AND across categories),
favorites-first ordering, and FlashList-backed results (FlashList's first real usage

- it was declared in the stack from P0 but unused until now). The detail screen
  (`ExerciseDetailScreen`) shows an image gallery, instructions, muscle/equipment tags,
  Polish name rendering via `formatExerciseName()` (FR-04), a videos section (currently
  empty - the catalog has 0% video coverage), a personal note, a per-exercise rest
  override, and three performance sections that were genuinely empty (not stubs) as
  shipped in this phase. Two of the three - previous performance and personal records -
  gained real content in P8 via optional render-prop slots the host route fills (see
  below), keeping this screen itself a dependency-free leaf; the third (a progress
  chart) remains genuinely empty pending a future statistics/charting phase. Favorite
  toggle fires haptics; custom exercise create/edit uses React Hook Form + Zod with
  primary/secondary muscle selection; delete is guarded by `listReferencingPlans`,
  which names the blocking plan rather than failing silently.

The Plans tab (`app/(tabs)/plans/`) is likewise a real nested Stack navigator (list ->
detail -> day editor) as of P5 - `app/(tabs)/_layout.tsx`'s tab registration changed
from `name="plans/index"` to `name="plans"`, mirroring the P4 exercises-tab
restructure exactly. `PlanListScreen` lists plans with day counts, active-plan
marking, reordering, duplication, and delete; `PlanDetailScreen` shows one plan's days
with the same operations one level down plus a superset-group editor
(`SupersetGroupEditor`); `PlanDayEditorScreen` edits a single day's exercises (added
via the new exercise-picker modal, reordered, given per-exercise sets/rep-range/RPE/
rest targets, removed). All three screens use `DraggableList` for reordering.

Two pre-existing P2 gaps were fixed as part of P4, not as unrelated drive-by changes:
catalog seeding (`database/seed/runSeed()`, built in P2 but never wired up) now runs
on every boot right after migrations and before `createContainer()`; and
`database/seed/loadCatalogAsset.ts` now correctly maps the on-disk catalog's
`primaryMuscles`/`secondaryMuscles: string[]` fields into `catalogSeeder.ts`'s
expected `muscles: {slug, role}[]` shape - previously nothing bridged this and every
catalog exercise silently seeded with zero muscles.

P4 verification: typecheck, lint, and the full Jest suite (473 tests) are clean;
`npx expo export --platform ios` bundles the whole app successfully, used as a
build-verification proxy in the absence of a simulator/emulator in the implementing
session (flagged, not silently skipped); a routine security review
(`reports/security-2026-08-06-p4.md`) found zero issues; an accessibility pass
(screen-reader announcements, image gallery labels, chip group semantics) fixed a few
real gaps and confirmed the rest already correct.

A dev-only `/dev/db-health` route (`app/dev/db-health.tsx`, same `__DEV__`-guarded
`Redirect` pattern as `/dev/gallery`) shows schema version, last migration, per-table
row counts, file size, `PRAGMA integrity_check`, SQLite version/compile options, and
FTS5/partial-index availability. Implementation proceeds one roadmap phase at a time
per `docs/ROADMAP.md` (P0-P16) - never skip ahead to a later phase's feature before
the current phase is committed.

`theme/tokens.ts` carries the full token set from ARCHITECTURE.md section 11
(color, space, radius, elevation, font, motion, hitSlop), not P0's bootstrap subset.
`components/ui` (22 primitives), `components/layout`, `components/feedback`
(including toast/sheet stores and root hosts), and `components/gestures`
(`SwipeableRow`, `DraggableList`, `PressScale`) are populated with real,
accessibility-audited implementations - no empty skeletons remain in those four
directories. `services/haptics` is a semantic wrapper (`setCompleted`,
`personalRecord`, `adjust`, `select`, `destructive`, `timerFinished`) that no-ops when
the haptics setting is off. `i18n/` provides a typed `t()` over an English-only
catalog (`i18n/catalogs/en.ts`) plus `expo-localization` for device-locale reads;
see the i18n note below for why it's hand-rolled rather than a library. A dev-only
`/dev/gallery` route (`app/dev/gallery.tsx`, `__DEV__`-guarded via `Redirect`) renders
every primitive in every variant and state - the review surface for design-system
changes going forward.

**i18n choice**: `t()` is a small, hand-rolled, compile-time-checked lookup
(`i18n/translate.ts` derives a `TranslationKey` union from the catalog's own shape,
so a typo or renamed key is a type error, not a runtime miss) rather than
i18next/i18n-js. Reasoning: v1 ships English-only (D-11), so a full i18n library's
runtime, context/provider surface, and plugin ecosystem buys nothing yet. Adding a
Polish catalog later is a data-only addition (a new file under `i18n/catalogs/`) with
no call-site refactor - revisit the library question only if a second locale or
plural rules beyond `one`/`other` are actually needed.

`features/profile/repository/SqliteProfileRepository` reads and writes the
`user_profile` table that already existed in `database/schema.sql` from P2 (no
migration needed for P3). `ProfileService` writes the avatar file to disk before
committing the DB row that references it, per ADR-0012's write-then-commit ordering
(the same pattern that ADR-0012 defines for progress photos, applied here to
avatars). `services/haptics/settings.ts` reads the `haptics.enabled` setting through
an MMKV mirror for a synchronous read inside gesture/press handlers, per ADR-0008's
mirroring pattern - SQLite stays authoritative and MMKV is re-synced from it on every
boot.

`features/exercise-library/repository/SqliteExerciseRepository` is the first feature
repository built after P3's `ProfileRepository` and the first real consumer of
`BaseSqliteRepository` beyond it. It maintains the `exercise_fts` FTS5 index
incrementally on every single-row write, using the contentless table's `'delete'`
special command plus a fresh insert rather than a plain `DELETE FROM exercise_fts
WHERE rowid = ?` - the latter throws on a contentless table, so this isn't a style
choice, it's a SQLite constraint. `catalogSeeder.seedCatalog()` still does a wholesale
FTS rebuild for bulk reseeds; only the single-row path goes through the incremental
maintenance. `ExerciseService` is Zod-validated and is the only door into the
repository from presentation, per the "no direct repository access" rule.
`assets/exercises/imageMap.ts` (1721 entries, generated by
`scripts/build-exercise-image-map.ts`) resolves a catalog filename to a static Metro
`require()` - the standard React Native pattern for a large set of runtime-keyed
bundled assets Metro can't resolve dynamically; `assets/exercises/index.ts` exports
the consumer-facing `getExerciseImageSource()`.

`features/plans/repository/{PlanRepository.ts,SqlitePlanRepository.ts}` is the app's
first aggregate-root feature repository (ARCHITECTURE.md section 8.3's
`PlanRepository` - a plan plus its days plus its day-exercises as one transactional
unit), built on the same `BaseSqliteRepository` foundation as
`SqliteProfileRepository`/`SqliteExerciseRepository`. Beyond section 8.3's original
17-method contract it adds five methods, the same kind of addition P4's
`ExerciseRepository` made with `deleteCustom`: `deletePlan`/`restorePlan` (soft
delete/undo) and `purgePlan` (hard delete - what the "delete a whole plan" user
action actually calls, since a hard delete is what's needed to fire
`workout_session`'s `ON DELETE SET NULL`/`ON DELETE CASCADE` for session-snapshot
survival), plus `restoreDay`/`restoreDayExercise` (undo pairs for the day/
day-exercise soft-delete methods already in the literal spec). `PlanService` is
Zod-validated against the schema's own CHECK constraints and is the only door into
the repository from presentation, same rule as `ExerciseService`. It routes
plan-level delete to the hard `purgePlan` (confirm-dialog, no undo -
`docs/ARCHITECTURE.md` section 10.2's nav rules reserve confirmation dialogs for
whole-plan delete) and day/day-exercise-level delete to the soft-delete-plus-undo-toast
pair instead (same nav rules, one tier down). Both `duplicatePlan` and `duplicateDay`
disambiguate name collisions the repository's own deep-copy leaves unresolved -
"(copy)", then "(copy 2)", "(copy 3)", ... - scoped globally across all plans for
`duplicatePlan` and per-plan for `duplicateDay`. `setSupersetGroup` requires at least
2 exercise ids to form or update a group, but allows exactly 1 to clear a
day-exercise back to standalone, enforced in the service one level above the
repository's own same-day invariant check. `services/container.ts` gained
`planRepository`/`planService`, the third feature repository pair after P3's profile
and P4's exercise-library ones.

The exercise-picker (`features/exercise-library/screens/ExercisePickerScreen.tsx`,
new - a multi-select sibling of P4's library screen, reusing its search hooks) is
reached through the app's first modal route group, `app/(modals)/` (`_layout.tsx` +
`exercise-picker.tsx`), from the plan day editor's "add exercise" action. Its result

- an unbounded list of selected exercise ids - comes back through a new root-level
  Zustand store, `stores/exercisePickerStore.ts`, rather than route params: Expo Router
  has no "push and await a result" primitive, and an unbounded id list has no business
  round-tripping through a URL query string. The store is scoped to exactly this
  open/close flow (cleared on both ends, never left holding a stale request) and lives
  at the project root rather than inside either feature, since `exercise-library` must
  stay a dependency-free leaf (section 9.1) and `plans` may only depend on it through
  its barrel - either feature owning the store would violate one of those two rules.

`components/gestures/DraggableList.tsx`'s tracked "Known gaps" item (gesture-only
reordering, no non-gesture alternative) was closed this phase across two rounds - the
first pass's fix didn't actually reach a native accessibility node through any of the
three real row components consuming it, caught by a follow-up accessibility review
and corrected in a second pass with a real regression test. See "Known gaps" below
for the full detail; not repeated here.

P5 verification: typecheck, lint, and the full Jest suite (70 suites, 616 tests, 1
pre-existing skip) are clean; `npx expo export --platform ios` was used again as the
build-verification proxy (no simulator/emulator available in this environment, same
constraint as P4); a security review (`reports/security-2026-08-06-p5.md`) found zero
critical/high/medium findings and one low/informational note (a non-atomic
multi-exercise-add batch); an accessibility review
(`reports/accessibility-2026-08-06-p5.md`) caught the `DraggableList` fix's
first-pass gap described above and blocked on it - zero blocking findings remain
after the second-pass fix. No new npm dependency was added this phase.

The active workout screen (`features/workout-logging/screens/ActiveWorkoutScreen.tsx`)
lives at `app/workout/active.tsx`, a root-level route outside `(tabs)` per ADR-0007:
"the workout is a mode the user entered, not a page they browsed to." Its own
`app/workout/_layout.tsx` presents it as `fullScreenModal` with `gestureEnabled: false`
and a slide-from-bottom animation, so neither platform's standard back gesture can
dismiss it by accident; the Android hardware back button is intercepted inside
`ActiveWorkoutScreen` itself (`BackHandler`, not the layout file, since the exit choice
it triggers needs `sessionService`/the store) and opens `WorkoutExitActionSheet`
(minimize/finish/discard) instead of popping the route. Minimizing (`router.back()`)
returns to the tab bar and leaves `ActiveWorkoutBanner` docked above it - a small,
persistent elapsed-time banner (no rest countdown; that half is P7) mounted once at
`app/(tabs)/_layout.tsx`, reading `activeWorkoutStore` through a selector, that
re-opens `workout/active` on tap. `routes.workout.active()` is the one new
`navigation/routes.ts` entry; `workout/summary/[sessionId]` stays absent, deliberately,
as P9 scope.

`features/workout-logging/repository/{WorkoutSessionRepository.ts,
SqliteWorkoutSessionRepository.ts}` is the app's second aggregate-root feature
repository, following the same pattern `PlanRepository` established in P5: a session
plus its `session_exercise` rows, its `workout_set` rows and its `active_session_state`
row is one repository, and (per ADR-0005) every mutating method is its own committed
transaction rather than a batched save - `finish()` is an `UPDATE`, not a migration
between a draft and a real storage form. Each method takes an optional trailing `tx` so
a caller composing a larger transaction can join it, same composition style as
`PlanRepository`. Section 8.3 lists three further methods (`listHistory`, `getSession`,
`updateHistoricalSession`) that are P9's scope and are deliberately absent rather than
stubbed; `restoreExercise`/`restoreSet` are present beyond the literal list, the same
kind of undo-toast-counterpart addition P5's `PlanRepository` made with
`restoreDay`/`restoreDayExercise`. `setExerciseNote`/`setSessionNotes` (FR-16) were not
part of the repository's first draft - a review pass surfaced that exercise/workout
notes had no write path at all, and both methods (plus `WorkoutSessionService`'s
Zod-validated wrappers and their own test coverage) were added before this phase's
commit, not after it, the same "caught and closed within the phase" pattern P4's
write-up used for its two P2 gaps. `services/container.ts` gained
`sessionRepository`/`sessionService`, the fourth feature repository pair after P3's
profile, P4's exercise-library and P5's plans ones.

FR-19's crash recovery is a boot-gate extension to `app/_layout.tsx`, built this phase
as the mechanism only - the Home dashboard's polished "Resume" banner card remains P10
scope (`docs/ROADMAP.md`'s P10 entry), not built here. Once the profile gate resolves,
`useSessionResumeGate` reads the synchronous MMKV `session.active` flag (written by
`useStartWorkout`/`useFinishDiscardWorkout` at the point a start/finish/discard
mutation actually commits, per ADR-0008's "kv writes happen at UI-adjacent call sites,
not inside services" rule) and, if set, calls `sessionService.findInProgress()`: a
fresh session redirects straight into `workout/active` via `<Redirect>`; a stale one
(`isStale`, past `workout.staleAfterHours`) shows a finish-or-discard `ConfirmDialog`
instead of silently resuming a workout the user may have forgotten overnight. If the
flag and the database disagree, the database wins (ADR-0005 mechanism 6) and the flag
is corrected in place rather than trusted again next boot. This check does not hold the
splash screen the way the profile query does - only the synchronous flag read has to
happen before the splash lifts, not the subsequent async lookup.

Set types are the 6-value enum from ADR-0006 (`warmup`, `normal`, `drop`, `failure`,
`assisted`, `partial` - `superset` is deliberately not one of them), with a single
normative semantics table (`features/workout-logging/domain/setSemantics.ts`) that
`SetVolume`/`SessionTotals` both read and a generated-matrix test keeps in sync with
the parallel `v_working_set` SQL view, per ADR-0006's "not optional" instruction.
Supersets are the relation `plans` already established (`superset_group` on
`session_exercise`, carried over verbatim from the plan day at `startFromPlanDay`
time) - the repository and `WorkoutSessionService.setSupersetGroup` (>=2 ids to
form/update a group, same minimum `PlanService` enforces) fully support editing it,
but no in-workout UI calls that hook this phase (`SupersetBracket` renders the
grouping read-only); a full multi-select regroup flow was scoped out, mirroring how P6
scoped exercise reordering to move-up/move-down rather than a drag gesture. Drop sets
chain via `parent_set_id` on `workout_set`, sharing the parent's `setIndex` rather than
incrementing it - one working set with drops is one set, not several.

`stores/activeWorkoutStore.ts` is the one Zustand store ADR-0008 names as a deliberate
exception to "Zustand is ephemeral UI state only": it mirrors the persisted
`ActiveSessionAggregate`, governed by five rules enforced by how this file and
`features/workout-logging/hooks/*` are written (not by the type system): hydrate from
SQLite on mount and only on mount; every edit updates the store synchronously and
dispatches a repository write, paired in the mutation hooks; a failed write reconciles
the store from the database, never the reverse; clear on finish/discard (and
defensively on a disruptive unmount, though the routine minimize flow deliberately
does not clear it, since `ActiveWorkoutBanner` needs it still populated); and consume
only through selectors, never the whole store with no selector.

Deliberately deferred, and why (both since closed - see the P7 and P8 write-ups
below): the rest timer (P7) - `RestTimerBar`'s slot was omitted from
`ActiveWorkoutScreen` entirely rather than a structurally-present-but-inert
placeholder, since nothing in P6 ever populated a timer deadline for it to react to.
Progression suggestions and PR evaluation (P8) - `CompletedSetResult.newPRs` was typed
`readonly never[]` and always `[]`; `PersonalRecordRepository` had a table and an index
from P2 but no implementation yet. The workout summary screen (P9) - `finish()`
navigates to `routes.tabs.home()` via `router.replace` instead, matching how
`discard()` already exits. Home also gained a minimal "Quick Start" button
(`useStartWorkout().startEmpty()`, with a blocked-session `ConfirmDialog` offering
Resume when one is already in progress) and `PlanDetailScreen`/`PlanDayCard` gained a
per-day "Start workout" action (`startFromPlanDay`, same blocked-session dialog) - both
minimal, additive entry points into the new screen, not the fuller P10 dashboard.

P6 verification: typecheck, lint, and the full Jest suite (86 suites, 782 tests
passing, 1 pre-existing skip) are clean; `npx expo export --platform ios` was used
again as the build-verification proxy (no simulator/emulator available in this
environment, same constraint as P4/P5); a security review
(`reports/security-2026-08-07-p6.md`) found zero critical/high/medium findings and two
low-severity, non-blocking notes (a `setSupersetGroup` update missing a
`deleted_at IS NULL` filter, mirroring an already-accepted P5 finding on
`PlanRepository`'s equivalent method; and `saveActiveState` lacking a Zod schema at the
service layer, not exploitable since every field it writes is either an id or a bound
numeric column with no free text). No new npm dependency was added this phase.

`RestTimerBar`'s slot, deliberately omitted from `ActiveWorkoutScreen` since P6, is
populated as of P7: `features/rest-timer/domain/resolveRestSeconds.ts` implements the
three-tier rest-duration precedence (exercise override, then plan day, then global
default) as the single place that logic lives, and
`features/rest-timer/domain/supersetRestRule.ts` implements D-03/ADR-0006's skip rule
(completing a set of a non-terminal superset member starts no timer; the last member's
does) - both pure calculators with fast-check property tests, per the project's
domain-testing convention. `features/rest-timer/services/RestTimerNotificationService.ts`
is an `expo-notifications` wrapper that schedules against an absolute deadline rather
than a relative delay or a JS timer (R-04), sets up its own Android notification
channel, requests permission lazily on the first real schedule attempt rather than
during onboarding, cancels on early finish, and never throws - every failure path
(denied permission, no native binding, a rejected native call) degrades to a no-op so
the timer keeps ticking in-app with no OS notification behind it. `stores/
restTimerStore.ts` is the project's second Zustand store holding real (non-ephemeral)
timer state alongside `activeWorkoutStore` - it owns `deadlineAt`/`totalSeconds`/`now`
and recomputes `remainingSeconds` fresh from a subtraction on every `tick()` rather
than decrementing an interval, the "recompute, never accumulate" pattern R-04 requires
to stay correct across backgrounding and Android Doze.

`features/rest-timer/components/{RestTimerBar,TimerPresetChips,RestTimerSettingsSheet}.tsx`
and `features/rest-timer/screens/TimerSettingsScreen.tsx` are the UI layer: the sticky
in-workout countdown bar plus its two settings surfaces (`app/(modals)/
rest-timer-settings.tsx` for the current exercise's override, `app/profile/settings/
timers.tsx` for the global defaults - both shipped this phase per Step 0 decision 4).
On the `workout-logging` side, `SqliteWorkoutSessionRepository.startFromPlanDay`/
`addExercise` now seed `session_exercise.rest_seconds_override` through
`resolveRestSeconds` instead of a bare plan-day value with no fallback - a real
pre-existing gap (not a P7 regression) the plan found while scoping this phase:
`startFromPlanDay` previously inherited `null` straight from the plan day with nothing
downstream ever resolving it, and `addExercise` hardcoded `null` unconditionally.
`WorkoutSessionService` reads `timer.defaultRestSeconds` from settings and passes it
down as a plain number, keeping the repository free of settings-schema knowledge, the
same layering rule used everywhere else in this codebase. A new repository method,
`setExerciseRestOverride` (mirroring the existing `setExerciseNote` pattern), was
added beyond the plan's original scope to support Step 0 decision 2 (tap-to-adjust
persists the new duration to the session, not just the running countdown) - the same
"found and closed within the phase" addition CLAUDE.md's P4/P5 write-ups already used
this phrasing for. `ActiveStatePatch` gained `timerDeadlineAt`/`timerTotalSeconds`/
`timerNotificationId` fields the plan's own brief had assumed P6 already added; it
hadn't, so P7 added them. The rest-timer notification's tap target (`gymtracker://
workout/active`) is now wired end-to-end in `app/_layout.tsx` (both the warm
`addNotificationResponseReceivedListener` path and the cold-start
`getLastNotificationResponseAsync` path), closing the deep-link gap
`RestTimerNotificationService`'s own doc comment had flagged as deferred to this pass.

Two "first real caller" moments worth noting the way P5/P6 called out their own:
`services/haptics/timerFinished()` - declared when haptics was built, never invoked
anywhere in the codebase since - now fires for real on timer expiry, gated on the
`timer.vibration` setting; and `hooks/useAppState.ts`, a thin
`AppState.addEventListener` wrapper, is the first occupant of the project-root
`hooks/` folder CLAUDE.md's folder structure has listed as reserved since P0.

P7 verification: typecheck, lint, and the full Jest suite (92 suites, 851 tests
passing, 1 pre-existing skip) are clean; `npx expo export --platform ios` was used
again as the build-verification proxy (no simulator/emulator/device dev-client
available in this environment, same constraint as every prior phase). A security
review (`reports/security-2026-08-11-p7.md`) found zero critical/high/medium/low
findings and one informational note carried forward from P6 (`saveActiveState` still
has no Zod schema at the service layer; this phase's three new timer columns land on
that same unchecked pass-through but are all settings-bounded, Zod/UI-clamped, or an
opaque `expo-notifications` id, never raw client input, so re-verified non-exploitable
rather than newly flagged). An accessibility review
(`reports/accessibility-2026-08-11-p7.md` - conducted by a general-purpose agent
standing in for the accessibility-agent role, which is not registered in this
environment's agent toolkit; noted here for provenance, not as a complaint) caught one
BLOCKING finding and it was fixed within the phase, not left open: `RestTimerBar`
handed `SwipeableRow` a bare `View` wrapping three separate interactive controls
(decrease, countdown/open-settings, increase) as its sole child, which
`SwipeableRow`'s child-cloning contract collapsed into one inert accessibility node
with no `onPress` of its own - reachable by touch but a dead end for VoiceOver/
TalkBack beyond the swipe-to-skip action. Fixed by restructuring so `SwipeableRow`
wraps only the countdown `PressScale` (already a real, correctly-labeled `Pressable`),
with the two adjust buttons rendered as independent siblings outside the swipeable
region. A real RNTL mount test (`__tests__/features/rest-timer/components/
RestTimerBar.test.tsx`) was added specifically to catch this regression class,
verified by temporarily reverting the fix and confirming the test fails before
restoring it - the same "verify the regression test actually regresses" discipline
P5's write-up used for its own accessibility fix. Separately, a code-review pass (not
accessibility-specific) caught and fixed two real correctness bugs before commit:
finishing or discarding a workout while a rest timer was still running used to leave
the timer running and its OS notification still scheduled (`useFinishDiscardWorkout`'s
`clearAndExit` now cancels the scheduled notification and clears the countdown as part
of `finish()`/`discard()`); and a `saveActiveState` write-ordering race where two
rest-timer operations racing on independent async chains of different lengths could
persist a stale, already-cancelled timer to disk (now guarded by a monotonic
operation-sequence check, `bumpTimerOperationSequence`). The same code-review pass,
separately again, also caught a countdown-announcement bug where a single upward
timer adjustment could permanently silence the periodic remaining-time announcement
for the rest of that countdown - fixed before the accessibility review even ran, and
independently re-verified correct by that review rather than taken on faith.

Deliberately out of scope, and why (same framing P6's write-up used): `timer.sound`
ships as a working, persisted setting on `TimerSettingsScreen`, but has no
audio-playback backend wired to it - this project has no sound-library dependency,
and adding one was explicitly out of scope for this phase's fixes, not silently
dropped.

`CompletedSetResult.newPRs`, typed `readonly never[]` and always `[]` since P6, is
real as of P8: `features/records/domain/{Estimated1RM.ts,ProgressionAdvisor.ts,
evaluateCandidateRecords.ts}` implement ADR-0015's three decisions (Epley/Brzycki
e1RM with documented guard rails, double-progression suggestions, and per-record-type
comparison), and `features/records/repository/{PersonalRecordRepository.ts,
SqlitePersonalRecordRepository.ts}` (`listCurrent`, `listRecent`, `evaluateAndUpsert`,
`listHistory`, `rebuild`) is the app's third aggregate-adjacent feature repository.
`SqliteWorkoutSessionRepository.completeSet` calls `evaluateAndUpsert` inside its own
transaction (the allowed `workout-logging -> records` dependency direction,
ARCHITECTURE.md section 9.1) and now returns real `newPRs`.
`features/workout-logging/repository/{ExerciseHistoryRepository.ts,
SqliteExerciseHistoryRepository.ts}` is a new read-only read model
(`getPreviousPerformance`, `getBestPerformance`, `listRecentSessionsForExercise`)
with no accompanying service, by design - it returns flat DTOs with nothing to
validate, the same shape a later `StatisticsRepository` is expected to have.
`services/container.ts` gained `recordRepository`/`recordService`/
`exerciseHistoryRepository`, the fifth and sixth feature repository pairs (counting
the read-only one) after P3-P6's profile, exercise-library, plans and
workout-logging ones (P7 added none - `rest-timer` owns no repository).

The UI layer landed in the same phase's third pass. `features/records/components/
{PRBadge,ProgressionHint}.tsx` are presentational-only (no fetching of their own) and
exported through the `records` barrel so `workout-logging` can render them - `PRBadge`
fires `services/haptics.personalRecord()` (declared when haptics was built, never
invoked anywhere in the codebase since - the same "first real caller" pattern P7's
own write-up used for `timerFinished()`) exactly once per distinct non-empty
`records` value it receives, keyed on the records' own ids so an unrelated re-render
never re-fires it. `SetRow.tsx` renders `PRBadge` per-set; `SessionExerciseCard.tsx`
renders `PreviousPerformancePanel` (now backed by real data instead of P6's
hardcoded empty state) and `ProgressionHint` alongside it, both computed by a new
`features/workout-logging/hooks/useExerciseHistory.ts`
(`usePreviousPerformance`/`useProgressionSuggestion`). `ProgressionAdvisor`'s
`primaryMuscleBodyPart` input turned out to already be flowing through the app with
no extension needed: `exercise.body_part` (-> `SessionExercise.exercise.bodyPart`,
an `ExerciseListItem` field) is derived at catalog-build time from the exercise's
primary muscle's `muscle.body_part` (`scripts/build-catalog.ts`'s
`MUSCLE_TO_BODY_PART`), so it already carries the exact value the domain calculator
wants. `targetRepRange` is always passed `null` instead - `SessionExercise` carries no
`target_rep_min`/`target_rep_max` fields (P8 pass 2 did not thread the plan day's rep
range onto the in-session exercise, and extending that repository contract was outside
pass 3's owned files) - `suggestNextProgression`'s own "derive one from the last
session's rep count" fallback covers this correctly, a real documented consequence of
scope rather than a silently dropped requirement.

`activeWorkoutStore` gained a `latestPR: { setId, records } | null` field (plus
`setLatestPR`/`clearLatestPR`), written from `useCompleteSet`'s existing async
`.then()` continuation - after the synchronous NFR-01 hot path already ran, so PR
evaluation adds no latency to "tap the checkbox, feel the haptic instantly."
`ActiveWorkoutScreen` self-clears it 4 seconds after it appears (a one-shot
celebratory badge, not state that should stick to a set forever) and passes it into
`FlashList` as part of a new `extraData` prop alongside `focusedSetId` - added because
both values are read from render-time closures rather than from `data` itself, and
this phase's own PR-badge integration test had caught a repaint that looked stale
without it. Test-agent's later coverage pass found the fuller picture, though:
`ActiveWorkoutScreen`'s `renderItem` is an inline arrow function defined in the
component body, so `FlashList`'s (like `FlatList`'s) cell-level `React.memo`
comparison already fails - and every cell already repaints - on every parent render,
independent of whether `extraData` changed. `extraData` is a correct, real addition
(it documents the actual dependency and keeps the badge correct the moment
`renderItem` is ever hoisted to a stable reference as a future perf pass), but it is
not, today, the mechanism actually keeping `PRBadge`/the focus highlight painted -
the inline `renderItem` is. Left in rather than pulled out: removing it would work
today and quietly reintroduce this exact staleness bug the day `renderItem` gets
memoized. See "Known gaps" below.

`ExerciseDetailScreen` gained two optional slot props (`previousPerformanceSlot`/
`personalRecordsSlot`, both `ReactNode`, both defaulting to the existing
`PerformanceEmptySection` treatment when omitted) rather than a new import -
`exercise-library` stays a dependency-free leaf (ARCHITECTURE.md section 9.1).
`app/(tabs)/exercises/[id].tsx` (previously a two-line wrapper) fills both slots using
`records`'/`workout-logging`'s hooks, the same "app/ composes feature barrels, even
though it can't reach a repository directly" pattern `useStartWorkout`'s own doc
comment already established.

Profile gained a "Personal records" row (`features/records/screens/
PersonalRecordsScreen.tsx`, the first screen in that feature's `screens/` folder,
reached via a new `routes.profile.records()` -> `/profile/records`) listing every
current PR, most recently achieved first, FlashList-backed per the project's own
list-size Definition-of-Done rule. It resolves exercise names for its rows via a new
`useRecordExerciseNames` hook - the one place `records` reaches into
`exercise-library`'s barrel (documented as a deliberate, cycle-safe judgment call in
that hook's own header comment: `exercise-library` is a leaf with no dependency of
its own, so this cannot create a cycle, and nothing in ARCHITECTURE.md section 9.1
forbids it, only the reverse direction). Settings gained a "Recalculate records" row
(confirm dialog, then `recordService.rebuild()`, with a pending spinner and a
success/failure toast) and a new `features/profile/screens/
ProgressionSettingsScreen.tsx` (`app/profile/settings/progression.tsx`) for
`oneRm.formula`/`progression.upperIncrementKg`/`progression.lowerIncrementKg` -
structurally mirroring `UnitsSettingsScreen.tsx` rather than P7's `timers.tsx`, since
this branch was cut before P7's implementation landed and `UnitsSettingsScreen` was
the real precedent that existed on disk at the time (both `timers.tsx` and
`progression.tsx` now coexist post-merge; unifying their structure was not revisited
as part of resolving the merge). `features/profile/hooks/useSettings.ts` gained
`useOneRmFormulaSetting`/`useProgressionIncrementSettings`, the same
`useQuery`/`useMutation` shape as `useHapticsSetting`/`useUnitsSettings`.

A real import cycle surfaced while wiring the presentation hooks and was fixed, not
worked around: `features/records/hooks/useRecords.ts` and `features/workout-logging/
hooks/useExerciseHistory.ts` are both re-exported through their feature's barrel (so
`profile`/`app/` can reach them), and `services/container.ts` itself imports each
feature's service from that same barrel - a hook in either file that called
`useContainer()` internally would close a real `barrel -> hook -> container ->
barrel` cycle, caught immediately by `import/no-cycle`. Both files take their
service/repository as a parameter instead (`useCurrentRecords(recordService,
exerciseId)`, `usePreviousPerformance(exerciseHistoryRepository, exerciseId)`), the
same pattern `useStartWorkout(sessionService)` already established in
`workout-logging`'s own barrel for exactly this reason - documented in both new
files' header comments so the next phase doesn't have to rediscover it. Screens are
never barrel-exported in this codebase (confirmed against every existing feature
before this phase, not assumed) - `PersonalRecordsScreen`/`ProgressionSettingsScreen`
follow that precedent and are imported by their `app/` route wrapper via direct file
path, which sidesteps the same class of cycle for the screens themselves.

P8 verification: typecheck, lint, and the full Jest suite (96 suites, 914 tests
passing, 1 pre-existing skip) are clean on the P8 branch before this merge; `npx expo
export --platform ios` was used again as the build-verification proxy (no
simulator/emulator/device dev-client available in this environment, same constraint
as every prior phase - `npm start` device verification remains deferred per the
user's own standing preference, noted here for continuity rather than silently
dropped). New RNTL coverage: `PRBadge`, `ProgressionHint`, `PersonalRecordsScreen`,
`ProgressionSettingsScreen`, `PreviousPerformancePanel`, plus extensions to
`useSetMutations.test.tsx`, `activeWorkoutStore.test.ts`, `SetRow.test.tsx`,
`ActiveWorkoutScreen.test.tsx`, `SettingsScreen.test.tsx` and `ProfileScreen.test.tsx`
for the new wiring and rows. A later test-agent coverage pass added five more: a
property-based e1RM/progression equivalence test (fast-check, verified
non-tautological by deliberately breaking `rebuild()`'s `ORDER BY` and confirming the
test actually failed before restoring it), ineligible-set-type cases
(`assisted`/`partial`), a `completeSet` transactional-atomicity test, a content-based
(not reference-based) `PRBadge` haptic dedup test, and a `FlashList` `extraData`
isolation test - taking the suite from 908 to 913, with the accessibility fix pass's
own new regression test (below) bringing it to the 914 above. No new npm dependency
was added this phase.

A security review (`reports/security-2026-08-11-p8.md`, security-agent-sonnet,
routine scope) found zero critical/high/medium findings, one low, and one
informational note. The low: `ConfirmDialog`'s Confirm button has no in-flight guard
of its own, so a fast double-tap on "Recalculate records" could start two overlapping
`rebuild()` transactions - not a P8-introduced pattern (every `ConfirmDialog`-gated
mutation in this codebase has the same unguarded shape, e.g. `PlanListScreen`'s
delete-plan flow) and non-corrupting regardless, since `rebuild()` is idempotent and
`ux_pr_current` backstops the single-current-row invariant at the SQLite level either
way. The informational note confirmed parameterized queries throughout both new
repositories and confirmed `completeSet`'s PR-evaluation write joins the caller's own
transaction rather than opening a second one - a throwing `evaluateAndUpsert` rolls
back the entire `completeSet` call, verified against a real integration test that
injects a failing repository and re-reads the database afterward, not just read from
the code. Nothing blocked commit.

An accessibility review (`reports/accessibility-2026-08-11-p8.md` - conducted by a
general-purpose agent standing in for the accessibility-agent role, the same
substitution P7's own write-up used) caught one BLOCKING finding and it was fixed
within the phase, not left open: `PRBadge` rendered inside `SetRow`'s pre-existing
`SwipeableRow`-cloned single accessible node. The container predates P8 (P6 already
handed `SwipeableRow` a compound, multi-control child), but P8's own new element
landed inside it and was swallowed by it - empirically confirmed via an RNTL
prop-tree dump, not just a static read. Fixed by rendering `PRBadge` as an
independent sibling below `SwipeableRow` rather than inside its single child, the
same "pull the non-interactive element out from under the collapse" shape P7's
write-up used to fix `RestTimerBar`'s equivalent bug. A real RNTL mount test
(`__tests__/features/workout-logging/components/SetRow.test.tsx`, "renders the PR
badge outside SwipeableRow's collapsed accessibility subtree (A11Y-P8-001
regression)") was added specifically to catch this regression class, verified with
the same revert-and-confirm discipline P7's write-up already established - reverting
the fix and confirming the test fails, before restoring it. Three further,
non-blocking findings from the same review were fixed in the same pass rather than
left open: `PRBadge`'s `accessibilityRole="text"` gained the paired `accessible` prop
it was missing (LOW); `PersonalRecordsScreen` gained the same
`AccessibilityInfo.announceForAccessibility` loading/empty-state pattern
`ProgressionSettingsScreen`'s own same-phase implementation already used, closing an
inconsistency within this phase's own diff rather than a codebase-wide gap (HIGH);
and `components/ui/ListRow.tsx` gained a `busy` prop
(`accessibilityState={{ disabled, busy }}`), mirroring `Button.tsx`'s existing
`loading`-prop pattern, wired into `SettingsScreen.tsx`'s "Recalculate records" row so
its in-flight state is announced rather than only implied by `disabled` (MEDIUM). See
"Known gaps" below for `SetRow`'s deeper, structural collapse concern that this fix
deliberately did not attempt to resolve.

Finishing a workout no longer drops the user straight back to Home, and past sessions
are no longer invisible - P9 closes both gaps. `useFinishDiscardWorkout`'s `finish()`
now navigates to `routes.workout.summary(sessionId)` (`app/workout/summary/
[sessionId].tsx`, inside the existing root-level `workout/` full-screen stack) instead
of Home; `discard()` is unchanged and still replaces with Home. A second new route,
`app/history/[sessionId].tsx` (root-level, per the folder tree - not nested under
`workout/`, since that stack is reserved for the in-progress workout "mode" per
ADR-0007, and not nested under `profile/`, since a session can be reached from more
than one surface later), is the persistent, revisitable view of a finished session;
`workout/summary/[sessionId]` is a one-time celebratory view by contrast, reached only
from finishing a workout, with nothing routing back into it. A third new route,
`app/profile/history.tsx` (`routes.profile.history()`), gives the history list an
entry point today, reached via a new "Training history" row on `ProfileScreen` -
mirroring P8's "Personal records" row precedent exactly (same `ListRow`, same
non-tab, profile-scoped, non-nested shape). This fills a routing gap
`docs/ARCHITECTURE.md` section 9/10 left implicit (both already showed
`history/[sessionId].tsx`, the detail route, but neither showed a list-route entry
point ahead of P10's `HOME --> HIST` edge or P12's `CAL --> HIST` edge, neither of
which exist yet) - a deliberate, precedented judgment call, not an invented deviation,
and folded back into `docs/ARCHITECTURE.md` as part of this update.

`WorkoutSessionRepository`/`SqliteWorkoutSessionRepository` gain the three methods
section 8.3 has named as this repository's contract since P6 but left deliberately
absent through P6-P8 - `listHistory` (a fixed most-recently-started-first,
offset-paginated read via `repositories/query`'s `buildLimitOffset`, never a filtered
search), `getSession` (one `completed` session's full aggregate, read-only), and
`updateHistoricalSession` (scoped to session-level `notes` only, the one field none of
the granular mutation methods already cover) - plus a new `deleteSession` beyond the
literal list, the same kind of addition `restoreExercise` already was in P6. Following
`PlanRepository.purgePlan`'s exact precedent: hard delete (a real `DELETE FROM
workout_session`, cascading via `ON DELETE CASCADE` to its `session_exercise`/
`workout_set` rows), gated behind `ConfirmDialog`, no undo - then
`personalRecordRepository.rebuild()` for every exercise the deleted session ever held
(collected before the delete, since the cascade takes `session_exercise` with it).

The historical-edit mechanism, rather than inventing one large `updateHistoricalSession`
patch type that would duplicate the granular mutation methods this repository already
had: eleven of those methods - `addExercise`, `removeExercise`, `restoreExercise`,
`setExerciseNote`, `appendSet`, `addDropSet`, `updateSet`, `completeSet`,
`uncompleteSet`, `deleteSet`, `restoreSet` - now go through a new private
`requireInProgressOrCompletedSession` guard (`in_progress` or `completed`;
`discarded`/nonexistent/soft-deleted still rejected) instead of the stricter
`in_progress`-only `requireInProgressSession` `finish`/`discard` still use.
A real, pre-existing gap surfaced while making this change, not introduced by it:
six of those eleven (`addExercise`, `removeExercise`, `restoreExercise`, `appendSet`,
`updateSet`, `completeSet`) already had the strict `in_progress`-only guard and were
simply loosened, but the other five - `setExerciseNote`, `addDropSet`, `deleteSet`,
`restoreSet`, `uncompleteSet` - had **no session-status guard at all** before this
phase, meaning any of them could previously write silently through a `discarded`
session with nothing to stop it. P9 both loosens the six existing guards and adds a
real guard for the first time to the other five, closing that latent gap rather than
purely "loosening" one, confirmed by security review (see below). `setExerciseRestOverride`
is deliberately excluded from this list: a completed session has no active rest timer
for an override to affect, and nothing in P9's UI edits one. Every one of the eleven
extended methods, except `setExerciseNote` (a pure-text write with nothing to go
stale), also calls a new private `syncCompletedSessionAfterEdit` - a no-op unless
`session.status === 'completed'` - which re-derives the session's four denormalized
totals via the same query `finish()` has always run (extracted into
`computeTotalsForSession` so neither duplicates it) and calls
`personalRecordRepository.rebuild()` for the exercise(s) the edit touched, rather than
`completeSet`'s own live-workout `evaluateAndUpsert`: `evaluateAndUpsert`'s "beats
whatever is currently current" comparison is not chronologically aware and can be
wrong for an out-of-order historical edit, exactly the drift `rebuild()` exists to
correct. `completeSet`'s own P9 branch (triggered when the session is `completed`)
reflects this: it calls `syncCompletedSessionAfterEdit` and then re-reads
`personal_record WHERE workout_set_id = ? AND is_current = 1` for its `newPRs`, rather
than calling `evaluateAndUpsert` at all.

`finish()` now writes `estimated_kcal` (only when `workout.showEstimatedCalories` is
on - `null` otherwise, with no retroactive backfill for sessions finished before this
phase or with the setting off, same as every other off-by-default setting in this
codebase) via a new pure calculator, `features/workout-logging/domain/
EstimatedCalories.ts` (`CALORIES_PER_MINUTE = 5`, `estimatedCalories(durationSeconds)`

- see `docs/adr/0018-estimated-calories-formula.md`), and now returns `newPRs`: every
  current personal record whose `session_id` is this session, read directly from
  `personal_record` (`WHERE session_id = ? AND is_current = 1`) rather than accumulated
  across the session's own `completeSet` calls. This re-derivation is safe specifically
  because `finish()` only ever runs against an `in_progress` session, so every record it
  sees was written by the ordinary real-time `evaluateAndUpsert` path in chronological
  order - the guarantee that does not hold for a historical edit, which is why
  `completeSet`'s own P9 branch (above) derives its `newPRs` differently.
  `WorkoutSessionService.finish()` reads `workout.showEstimatedCalories` and passes it
  down as a plain boolean, mirroring exactly how it already reads
  `timer.defaultRestSeconds` for `startFromPlanDay` - the repository stays free of
  settings-schema knowledge. `workout.showEstimatedCalories` (default `false`, per D-04)
  is a new settings key, surfaced as a single `Switch` row on `SettingsScreen` rather
  than a dedicated sub-screen, mirroring the existing `haptics.enabled` row's shape, not
  P7/P8's multi-field sub-screens.

The UI layer: `WorkoutSummaryScreen` (`app/workout/summary/[sessionId].tsx`) is the
post-finish celebratory summary, with a share-as-image action via two new
dependencies installed through `expo install` - `react-native-view-shot@5.1.0`
(captures an off-screen `ShareableSummaryCard` built purely from the session's own
already-displayed totals) and `expo-sharing@~57.0.11` (hands the resulting PNG to the
native share sheet); `expo-sharing`'s auto-registered config plugin is a genuine
no-op, confirmed by reading its source during the security pass, and was left
unregistered in `app.config.ts` at the time - a later bug-fix pass diagnosing a
`Cannot find native module 'ExpoSharing'` crash (root cause: a stale dev-client build
missing the compiled native module, unrelated to plugin registration - a fresh
dev-client build fixes the actual crash) added `'expo-sharing'` to `app.config.ts`'s
`plugins` array as a defensive step; re-reading `node_modules/expo-sharing/plugin`
at that point reconfirmed it remains a no-op with no share-extension options passed,
so registering it changes nothing functionally, it is just no longer literally
absent from the plugins list.
`WorkoutHistoryListScreen` (`app/profile/history.tsx`) is a paginated, month-grouped
`FlashList` - `useSessionHistoryList`'s `useInfiniteQuery` fetches `HISTORY_PAGE_SIZE
= 50` rows per page (well inside `repositories/query`'s 100-row clamp) via
`listHistory`, grouped client-side into month sections by `groupSessionHistoryByMonth`

- scaled to a 2,500-session fixture per a new benchmark case in `__tests__/database/
benchmarks.perf.test.ts` (0-1ms, well under the 50ms budget). `WorkoutHistoryDetailScreen`
  (`app/history/[sessionId].tsx`) is read-only by default with an inline "Edit"/"Done
  editing" toggle that swaps every exercise card between a flat `ReadOnlyExerciseCard`
  and the full, already-existing `SessionExerciseCard` editing surface, plus a hard-delete
  "Delete workout" action (`useDeleteSession`) gated behind `ConfirmDialog` with explicit
  irreversibility copy ("This permanently deletes the workout and every set logged in
  it, and recalculates any personal records it held. This cannot be undone.") and its
  `Button`'s own `loading`/`disabled={mutations.isMutating}` props guarding it against
  racing an in-flight edit.

`useFinishDiscardWorkout.finish()` seeds the query cache at `sessionSummaryKeys.detail(sessionId)`
(`features/workout-logging/hooks/useSessionHistory.ts`) with the real `SessionSummary`
`sessionService.finish()` returns - including `newPRs`, which cannot be re-derived
later, per that field's own doc comment - before navigating, so `WorkoutSummaryScreen`
reads it back with no extra request the instant it mounts; a cold cache (e.g. the
screen reached some other way) falls back to a fresh `getSession()` call with an empty
`newPRs`, consistent with `workout/summary/[sessionId]` being a one-time celebratory
view by design, `history/[sessionId]` being the persistent one.

P9 verification: typecheck, lint, and the full Jest suite (112 suites, 1062 tests
passing, 1 pre-existing skip) are clean; `npx expo export --platform ios` was used
again as the build-verification proxy - no simulator/emulator/dev-client available in
this environment, same constraint as every phase since P4, confirmed explicitly with
the user in this phase's own Step 0 rather than silently assumed. A security review
(`reports/security-2026-08-13-p9.md`, security-agent-sonnet, routine scope) found zero
critical/high/medium findings, one low, one informational. The low: `ConfirmDialog`'s
Confirm button still has no in-flight guard of its own (the same gap already flagged
in P8's report, shared by every `ConfirmDialog`-gated mutation in this codebase), worth
re-flagging because `deleteSession` is the first call site gating a genuinely
irreversible, no-undo hard delete rather than an idempotent operation like P8's
`rebuild()` - still non-corrupting, since `ExpoSqlExecutor.transaction()`'s single-
connection serialization means a double-tap's second call just hits zero affected rows
and surfaces a spurious error toast, not a double delete. The informational note
confirmed full parameterization across every new query and that the loosened guard is
not a privilege-escalation concern in an offline, single-local-user app with no
cross-user authorization boundary to fail.

An accessibility review (`reports/accessibility-2026-08-13-p9.md`, general-purpose
agent standing in for the accessibility-agent role, the same substitution P7/P8 used)
found no BLOCKING finding - explicitly checked, not assumed, that the `SwipeableRow`-
collapse bug class that blocked P7 and P8 does not recur: `SetRow.tsx`/
`SessionExerciseCard.tsx`, the two components carrying that pre-existing, still-tracked
structural gap, are byte-identical to `main` in this diff (confirmed via `git diff
main --stat`), and no new P9 file imports or renders `SwipeableRow` at all (confirmed
via a full-diff grep). Three non-blocking findings, all fixed within the phase, the
same "fix non-blocking findings same-phase" precedent P8's write-up already
established: the off-screen `ShareableSummaryCard` capture target was fully exposed to
assistive tech (an RNTL prop-tree dump proved zero `accessibilityElementsHidden`/
`importantForAccessibility` anywhere in its ancestor chain, unlike this codebase's
seven other "exists but must not be perceived" sites) - fixed by adding both props to
its wrapper `View`, verified with the same revert-and-confirm discipline P7/P8's own
regression tests used; `WorkoutSummaryScreen` and `WorkoutHistoryDetailScreen` never
announced their loading-skeleton state while `WorkoutHistoryListScreen` - the third
new P9 screen in the very same diff - already had the correct `AccessibilityInfo.
announceForAccessibility(t('common.loading'))` pattern (the same violation class
A11Y-P8-003 already named and fixed once, recurring as an in-phase inconsistency
rather than a fresh gap) - both screens now carry it; and toggling "Edit"/"Done
editing" on `WorkoutHistoryDetailScreen` restructured every exercise card with no
announcement beyond the toggle button's own label change - now announces the mode
transition explicitly. `SetRow`'s pre-existing, already-tracked `SwipeableRow`-collapse
gap (see "Known gaps") is now reachable from a second screen (this screen's edit mode,
which reuses `SessionExerciseCard` unchanged) in addition to `ActiveWorkoutScreen` -
noted for awareness, not a new finding, since P9 neither created nor worsened it.

A `/code-review high` pass against `main` found 10 findings, 8 real and fixed before
commit: a query hook missing an `enabled` guard for an undefined `sessionId`; the
delete button's `isMutating` flag existed but was never wired to actually gate the
button, which could otherwise let a hard delete race an in-flight edit's own
transaction; `addDropSet` had been missed entirely from the status-guard-and-resync
sweep described above and was brought in line with its sibling methods (2 new tests);
a real concurrency bug in multi-select "add exercise," where N unawaited transactions
raced on `sort_order` - fixed by making the adds sequential `await`s instead; dead,
duplicate invalidation logic removed now that the real invalidation function is shared
via `invalidation.ts`; one hardcoded, untranslated string routed through `t()`; and two
cases of drifted duplicated logic extracted into shared helpers - `ExerciseThumbnail.tsx`
(a single `EXERCISE_THUMBNAIL_SIZE = 44` replacing two independently-hardcoded
constants, 44 and 40, that had already drifted apart between `ExerciseHeader.tsx` and
the new `ReadOnlyExerciseCard`) and duration formatting now delegating to the existing
`formatElapsedSeconds` instead of reimplementing it.

**A known gap, decided with the user rather than silently deferred**: deleting the
last remaining set from an exercise during a historical edit leaves that exercise as
an empty card rather than auto-removing it - found by test-agent's coverage pass and
demonstrated with a real test documenting the current behavior (not a fix). A true
fix needs to interact with the existing per-set undo toast (a combined undo restoring
both the set and the exercise together, not just the set alone) - real new mechanism
work, not a call-site change. Asked directly, the user chose to document this as a
known gap and defer the fix to a future pass rather than rush a fix risking a subtle
undo-interaction bug; see "Known gaps" below.

**Documentation-only addition (2026-08-11):** `daily-goals` is a new, twelfth feature
added to the roadmap as `P17 - Daily goals and reminders` (`docs/ROADMAP.md`),
architecture-planned in `docs/ARCHITECTURE.md` section 2.1 (FR-27..FR-30), section
7.12 (schema - `daily_goal`, `daily_goal_entry`, `daily_reminder`), sections 9/9.1
(folder structure, dependency graph) and section 10 (navigation), plus
`docs/adr/0016-shared-notification-scheduler.md` and
`docs/adr/0017-daily-goal-reminder-scheduling.md`. As of this update it is
documentation and architecture planning only - no `features/daily-goals/` directory,
no `app/goals/` routes, no `services/notifications/` implementation, and no
`002_daily_goals.ts` migration exist in this repo yet. A future implementing session
starts from those documents, not from any code.

**Home dashboard (P10):** the Home tab is no longer P6's placeholder (wordmark plus a
single Quick Start button) - it is a real, composed dashboard, and `docs/ROADMAP.md`'s
MVP line is now correctly closed. `features/home/` is a new, thirteenth feature
directory (see "Twelve features total" below, now thirteen), built to the same "read
model, no accompanying service" shape P8's `ExerciseHistoryRepository` established.
`features/home/domain/{StreakCalculator.ts,nextSuggestedPlanDay.ts}` are pure
calculators: `calculateStreak` implements the "today not yet trained doesn't break the
streak" grace rule (a streak only breaks once a full calendar day passes with zero
completed sessions), DST-boundary and midnight-boundary tested per the roadmap's own
acceptance criteria, and now also exports `ONE_DAY_MS`/`parseLocalDate`/
`formatLocalDate` for `useHomeDashboard.ts` to reuse (see the code-review paragraph
below); `nextSuggestedPlanDay` is a simple `sort_order` rotation - the day after
whichever plan day the most recently completed session used, wrapping to the first day
after the last - with no rest-day or streak awareness, per this phase's own Step 0
decision (that stays an unchanged backlog item). `features/home/repository/
{HomeDashboardRepository.ts,SqliteHomeDashboardRepository.ts}`
(`getTrainingLocalDates`/`getWeeklySummary`/`getLastCompletedSession`/
`getMostRecentCompletedPlanDayId` - every query parameterized and `deleted_at IS NULL`-
filtered) is the seventh feature repository pair added to `services/container.ts`
(`homeDashboardRepository`), after P3-P9's profile/exercise-library/plans/
workout-logging/records/exercise-history ones. `features/home/hooks/
useHomeDashboard.ts` composes every piece - its own repository calls plus the active
plan/plan-days from `plans`' barrel and the latest record from `records`' barrel -
through one `useQuery` under `['home','dashboard']` (already listed in section 12.1's
query-key table before this phase implemented it) so the screen sees a single
`isPending`/`isError`/`refetch` rather than five independent ones, this phase's own
acceptance criterion; its five dependencies
(`homeDashboardRepository`/`planService`/`recordService`/`exerciseService`/`clock`) are
taken as constructor parameters rather than resolved via an internal `useContainer()`
call, the same DI shape `useStartWorkout(sessionService)`/`useCurrentRecords
(recordService, ...)` already established to keep `import/no-cycle` satisfied across a
barrel-exported hook. Five presentational cards
(`ActivePlanCard`/`LastWorkoutCard`/`StreakCard`/`LatestPRCard`/`WeeklySummaryCard`),
each with its own real, designed empty state (no active plan, never trained, no PR yet)
rather than a shared generic placeholder; `HomeScreen.tsx` assembles them plus the
existing Quick Start button (unchanged behavior - always starts an empty workout, per
Step 0 decision 3) inside a `Screen scroll` wired to a new `refreshControl` prop on
`components/layout/Screen.tsx` for pull-to-refresh - the first real caller of that prop,
which also fixed a pre-existing type bug (`refreshControl` was typed as a bare
`ReactElement`, which didn't satisfy `ScrollView`'s own prop type, caught only because
this phase was the first to actually pass one). `features/home/screens/
PlanDayPickerScreen.tsx`, reached via a new `(modals)/plan-day-picker` route
(`routes.modals.planDayPicker(planId)`, the same "plain id as a route param" shape
`restTimerSettings` already used, not `exercisePicker`'s store - the result here is a
single `planDayId` picked once, not an unbounded list), backs `ActivePlanCard`'s
"change day" action, shown only when the active plan has more than one day.
`app/(tabs)/index.tsx` and `app/(modals)/plan-day-picker.tsx` are both thin wrappers,
per this file's own "`app/` never contains screen bodies" rule. FR-19's crash-recovery
resume banner needed no new work this phase: `ActiveWorkoutBanner`, built in P6, already
satisfied the acceptance criterion and was re-confirmed in review rather than
re-implemented.

A deliberate deviation from `docs/ARCHITECTURE.md` section 8.3, recorded this session as
`docs/adr/0019-home-dashboard-read-model.md`: `HomeDashboardRepository`'s streak and
weekly-summary reads are lightweight, home-owned queries rather than the
`StatisticsRepository.streak()`/`weeklySummary()` methods section 8.3 has named since
before this feature existed. `statistics` is still an empty P11 skeleton, and pulling it
forward this phase just to host two methods Home needs today was rejected in favor of a
small, already-precedented read model - the same "flat DTOs, nothing to validate" shape
`ExerciseHistoryRepository` established in P8. The ADR's migration note is P11's to act
on: either keep Home on its own read model permanently, or migrate
`useHomeDashboard.ts`'s two repository calls onto the real `StatisticsRepository` once it
exists. Related, and worth stating explicitly rather than leaving implicit:
`docs/ARCHITECTURE.md` section 9.1's dependency-graph diagram already drew `HOME --> STAT`
and `HOME --> DG` edges before this phase (planned, forward-looking architecture, not
code) - as of this phase's real implementation, `home` depends on `workout-logging`,
`plans`, and `records` only (read-only, one direction, nothing depends back on `home`).
The `STAT` edge is exactly the deviation this ADR records (Home does not call
`StatisticsRepository` in v1.0), and the `DG` edge remains wholly unbuilt (`daily-goals`
is still documentation-only, P17) - both diagram edges describe a future state, not this
phase's shipped code, and are left in the diagram as intent rather than removed.

A real navigation bug was found and fixed during code review, across two passes -
documented here with the same technical depth P7's write-up gives its own
`RestTimerBar`/`SwipeableRow` bug. `PlanDayPickerScreen`'s original design tried to
`router.push('/workout/active')` on a day tap and then self-pop
(`router.back()`) once the start settled, to avoid leaving a stale modal on the
navigation stack. A `/code-review high` pass first found the resume-from-blocked-session
path never triggered the pop at all (a guard-timing gap) - but deeper investigation,
reading `node_modules/expo-router`'s actual `goBack` implementation rather than assuming
its semantics, found the entire push-then-pop design was unsound even on the
direct-start "happy path": `goBack`'s bubbling semantics target whichever screen is
_currently focused_ (the just-pushed `workout/active`), not the picker sitting
underneath it, so calling `router.back()` there would have dismissed the just-started
workout screen, not the stale picker. Fixed by adding a `{ navigation: 'push' |
'replace' }` option to `useStartWorkout`'s `startFromPlanDay`/`startEmpty`/
`resumeBlocked` (default `'push'`, so every other existing caller -
`PlanDetailScreen`'s day-card "Start" action, Home's own Quick Start - is unchanged) and
having the picker use `'replace'` for both the direct-start and resume-blocked paths:
`router.replace` swaps the picker's own stack entry for `workout/active` in one atomic
action, the same cross-group `replace` mechanism `useFinishDiscardWorkout` already uses
for `finish()`/`discard()` (ADR-0007 rule 3) - so there is no push-then-pop ordering to
get right, and no window where both screens are on the stack at once. Verified with a
real regression test (`__tests__/features/home/screens/PlanDayPickerScreen.test.tsx`)
covering both the direct-start and resume-from-blocked paths, asserting `router.replace`
is called and `router.push`/`router.back` are not. The same code-review pass, in the
same commit-to-be, also fixed: `app/(modals)/plan-day-picker.tsx` originally contained
the full screen body, violating the "`app/` never contains screen bodies" rule -
extracted into `features/home/screens/PlanDayPickerScreen.tsx`, `app/` reduced to a thin
wrapper; `useHomeDashboard.ts`'s two plan-dependent reads (the plan aggregate and its
most recently completed day) ran sequentially despite no dependency between them - now
run via `Promise.all`; `useHomeDashboard.ts` duplicated `StreakCalculator.ts`'s
calendar-math primitives verbatim - `StreakCalculator.ts` now exports
`ONE_DAY_MS`/`parseLocalDate`/`formatLocalDate` for reuse, its own `calculateStreak`
behavior and tests unchanged; and `features/home/components/formatHomeDuration.ts`
duplicated `workout-logging`'s `formatSessionDurationSeconds` byte-for-byte -
`workout-logging`'s barrel now exports it, `home` delegates instead of reimplementing.

An accessibility review (`reports/accessibility-2026-08-18-p10.md`, general-purpose
agent standing in for the accessibility-agent role, the same substitution P7/P8/P9
used) found no BLOCKING finding, explicitly confirming - not assuming - that the
`SwipeableRow`-collapse bug class that blocked P7 and P8 does not recur:
`grep -rn "SwipeableRow" features/home` returns zero matches, since `SwipeableRow` is
never imported anywhere under this feature. Two non-blocking (HIGH) findings were found
in this phase's genuinely new UI, both fixed within the phase with real regression
tests (the same "fix non-blocking findings same-phase" precedent P8/P9 used).
A11Y-P10-001: `PlanDayPickerScreen.tsx` never announced its loading/empty state via
`AccessibilityInfo.announceForAccessibility`, unlike this same phase's `HomeScreen.tsx`
in the very same diff - fixed, matching `PersonalRecordsScreen.tsx`'s established
pattern. A11Y-P10-002: the day-row's `onPress={isStarting ? undefined : ...}` pattern
took the entire row out of `ListRow`'s accessible branch the instant a start began,
silently discarding the `accessibilityRole`/label/`busy` state set two lines below -
confirmed via a real RNTL prop-tree dump (not just static reading) showing empty props
during that window, fixed by gating on `disabled` alone instead of nulling `onPress`,
matching `Button.tsx`'s own `loading`-state pattern. A structurally similar,
pre-existing `onPress`-nulling conditional was noted in
`features/plans/screens/PlanDetailScreen.tsx:188` (P6, out of scope for this review,
lower-risk since it conditionally renders the whole button rather than swapping an
already-visible row's accessible/non-accessible variant) - flagged for awareness only,
not fixed.

A security review (`reports/security-2026-08-18-p10.md`, security-agent-sonnet, routine
scope) found zero critical/high/medium/low findings and three informational notes: all
new SQL in `SqliteHomeDashboardRepository.ts` fully parameterized with consistent
`deleted_at IS NULL` filtering on every query; the `useStartWorkout` navigation-option
addition confirmed additive and non-regressing for its two pre-existing callers (every
public method's new option is optional, defaulting to `'push'`); no injection surface
in the new route/query-key handling; no new npm dependency. Nothing needed fixing.

P10 verification (all independently re-run by the orchestrator, not just agent-reported):
`npx tsc --noEmit` clean; `npx eslint .` clean (0 errors repo-wide, only the same class
of pre-existing `no-require-imports` warnings in test files every prior phase already
has); full Jest suite: 123 suites, 1132 passed, 1 pre-existing skip; `npx expo export
--platform ios` bundled successfully, used again as the build-verification proxy - no
simulator/emulator/dev-client available in this environment, the same constraint every
phase since P4 has flagged (dev-client build remains deferred per the user's own
standing preference, noted here for continuity rather than silently repeated without
comment).

**Statistics and charts (P11):** the Stats tab is no longer P6's placeholder "not built
yet" empty state - it is a real, composed dashboard, and this is the first phase past
`docs/ROADMAP.md`'s v1.0 MVP line. `features/statistics/` fills the P2-era empty
skeleton directory, built to the same "read model, no accompanying service" shape P8's
`ExerciseHistoryRepository` and P10's `HomeDashboardRepository` established.
`features/statistics/domain/{statRange.ts,dateRangeBuckets.ts,localDate.ts,
exerciseProgressionReducer.ts,yearlyHeatmapBinning.ts}` are pure calculators:
`resolveStatRange` maps the four-option range selector (`4w`/`3m`/`1y`/`all`) to
concrete `[localDateFrom, localDateTo]` bounds plus a bucket granularity
(`day`/`week`/`week`/`month` respectively - Step 0 decision 1); `dateRangeBuckets.ts`
generates gap-free bucket boundaries and re-buckets already-day-level SQL aggregates
in JS (never a second, independently-hand-written SQL date-bucket expression - the
file's own header comment explains why this is not the "load-all-then-sum-in-JS"
pattern CQRS-lite forbids); `exerciseProgressionReducer.ts` reduces raw per-set rows
into one `SeriesPoint` per bucket per metric (`top_set`/`e1rm`/`volume` - `top_set`/
`e1rm` return `null`, not `0`, for a bucket with no record-eligible set, matching
ADR-0015's "shows nothing rather than a number" philosophy); `yearlyHeatmapBinning.ts`
gap-fills a full calendar year and quantile-bins each trained day into levels 1-4 over
the year's trained-day volumes only (Step 0 decision 3, GitHub-contribution-graph
style). `localDate.ts` intentionally duplicates `home`'s `StreakCalculator.ts`
calendar-math primitives rather than importing them - the module dependency graph
forbids `statistics` depending on `home`, and both files are simply a transcription of
the same timezone-free `YYYY-MM-DD` arithmetic, the same reasoning
`features/records/domain/Estimated1RM.ts` already gives for its own deliberately
duplicated `SET_TYPES` union.

`features/statistics/repository/{StatisticsRepository.ts,SqliteStatisticsRepository.ts}`
ships six of section 8.3's originally-planned eight methods -
`volumeByPeriod`/`sessionFrequency`/`durationTrend`/`muscleGroupVolume`/
`exerciseProgression`/`yearlyHeatmap` - deliberately never implementing
`weeklySummary()`/`streak()` at all. This resolves `docs/adr/
0019-home-dashboard-read-model.md`'s open migration note (added when P10 built its own
`HomeDashboardRepository` rather than pulling `StatisticsRepository` forward a phase
early): Home keeps its lightweight read model **permanently**, since neither the
roadmap's P11 scope nor its acceptance criteria call for either method on the
Statistics tab, and migrating already-shipped, tested P10 code for zero user-visible
benefit was rejected as unwarranted churn - see that ADR's own "P11 resolution"
section for the full reasoning. Every date-bounded method takes concrete
`[localDateFrom, localDateTo]` + `bucket` rather than a `StatRange` enum (range
resolution is a hooks-layer concern, keeping the repository as settings-free as every
other repository in the codebase) - except `exerciseProgression`'s `e1rm` metric,
which resolves `oneRm.formula` from settings _internally_, reusing
`SqlitePersonalRecordRepository.resolveFormula`'s exact pattern (ADR-0015's "one
module owns every training formula," extended to this second repository since both
legitimately need the same setting). This is the app's second `statistics -> records`-
class dependency (a pure domain-calculator reuse -
`estimated1RM`/`isRecordEligibleSetType` - not a write-service call), a documented
addition to `docs/ARCHITECTURE.md` section 9.1 alongside the already-established
`records -> exercise-library` edge. `muscleGroupVolume` groups by the already-
denormalized `exercise.body_part` column (not a fresh `exercise_muscle` join),
primary-muscle-only with no double counting (Step 0 decision 2); a `NULL` `body_part`
(a custom exercise with no muscle selected) buckets under a synthesized `'other'`
slice rather than silently vanishing. `services/container.ts` gained
`statisticsRepository`, the eighth feature-repository pair after P3-P10's profile/
exercise-library/plans/workout-logging/records/exercise-history/home ones.

`components/charts/` is real as of this phase - the ADR-0010 Victory Native XL
adapter, declared since P0 as an empty `.gitkeep` skeleton, is now `ChartCard`,
`LineChartView`, `BarChartView`, `StackedBarChartView`, `HeatmapView`, `ChartTooltip`,
`ChartLegend`, and `types.ts`. Two deliberate deviations from ADR-0010's original
sketch, both plan-decided at kickoff: `StackedBarChartView` is custom `View`-drawn
proportional bars rather than `victory-native`'s own `StackedBar` (its stacked keys
are a static generic type parameter, which does not fit a runtime-variable category
list like `body_part` slices without an `any` escape hatch this project's Definition
of Done forbids); and chart interactivity was trimmed to static rendering for this
pass - no drag-to-inspect tooltip gesture (`ChartTooltip` still exists as a static
positioned label, satisfying the 8-file adapter surface; wiring it to
`useChartPressState` is a real, scoped follow-up, not attempted half-finished here).
`ChartCard`'s shipped shape also moves range selection to one screen-level
`StatRangeSelector` shared by every card rather than a `range`/`onRangeChange` pair
per card (ARCHITECTURE.md section 10's original table) - every chart on a Statistics
screen shares one range, so a per-card selector would be redundant UI.

The UI layer: `features/statistics/components/` has seven cards -
`VolumeChartCard`/`FrequencyChartCard`/`MuscleVolumeCard`/`ExerciseProgressionCard`/
`StatRangeSelector` from section 10's original list, plus `DurationTrendCard` and
`YearlyHeatmapCard` beyond it (the roadmap's own "duration trend" and "yearly activity
heatmap" acceptance items have no card named for them in that table, an oversight
this phase's plan corrects rather than silently reproduces). `useStatisticsDashboard`
composes `volumeByPeriod`/`sessionFrequency`/`durationTrend`/`muscleGroupVolume`/
`yearlyHeatmap` into one `useQuery` under `['stats','dashboard',range]` (the query-key
shape ARCHITECTURE.md section 12.1 already anticipated) - the same "one query, one
`isPending`/`isError`/`refetch`" acceptance criterion P10's `useHomeDashboard`
established for Home, now reused for Stats. `useExerciseProgression` backs both
`ExerciseProgressionScreen` (`stats/exercise/[exerciseId]`, reached from the
Statistics tab) and `ExerciseDetailScreen`'s third slot, `progressChartSlot` - empty
since P4, tracked in this file's own prose as "pending a future statistics/charting
phase," which this phase is. `app/(tabs)/stats/` is restructured into a real nested
Stack navigator exactly the way P4/P5 restructured Exercises/Plans
(`app/(tabs)/_layout.tsx`'s tab registration: `"stats/index"` -> `"stats"`) - the last
of the five tabs to leave its P6-era placeholder behind.

A real accessibility gap was found and fixed during this phase's own review, not
carried forward: `LineChartView`/`BarChartView` render through `victory-native`'s Skia
canvas, which exposes nothing to the accessibility tree, and neither they nor
`ChartCard`'s content wrapper supplied any textual fallback - verified empirically via
an RNTL `toJSON()` prop-tree dump (not just a static-code assumption) showing zero
accessibility props on a rendered card's content, leaving four of five dashboard cards
(Volume, Frequency, Duration, Exercise Progression) completely silent for VoiceOver/
TalkBack (A11Y-P11-001, HIGH, non-blocking). Fixed with an opt-in
`contentAccessibilityLabel` prop on `ChartCard` plus a new `summarizeSeries()` helper
in `components/charts` (min/max/count over a series), wired into the four affected
cards with real, translated, data-summarizing labels (e.g. "Volume chart, 12 periods,
ranging from 1200 to 3400 kg") - deliberately _not_ wired into `MuscleVolumeCard`,
since its `StackedBarChartView` content is already independently accessible via real
per-row `Text`, and applying the same wrapper there would collapse it into exactly the
`SwipeableRow`-style compound-node anti-pattern this project's P7/P8 reviews already
fixed elsewhere. A second, MEDIUM finding: `HeatmapView`'s `accessibilityLabel` was
hardcoded, untranslated English describing the chart type rather than its data
(A11Y-P11-002) - fixed by making the prop required (no silent default) and having
`YearlyHeatmapCard` compute a real, translated, count-aware summary ("2026 training
activity heatmap, 42 training days"). The recurring `SwipeableRow`-collapse bug class
that blocked P7/P8 was confirmed absent from this feature entirely (`grep -rn
"SwipeableRow" features/statistics components/charts "app/(tabs)/stats"` returns zero
matches) - explicitly checked, not assumed, per this project's own established
practice for that recurring finding class.

A security review (`reports/security-2026-08-18-p11.md`, security-agent-sonnet,
routine scope) found zero critical/high/medium/low findings and four informational
notes: every new query in `SqliteStatisticsRepository.ts` is fully parameterized with
consistent `deleted_at IS NULL`/`status = 'completed'` filtering (three methods
inherit it for free from the pre-existing `v_working_set`/`v_session_summary` views;
`sessionFrequency`/`durationTrend` carry it inline); the `oneRm.formula` resolution is
byte-identical to the already-reviewed `SqlitePersonalRecordRepository.resolveFormula`,
introducing no new surface; no new npm dependency (`victory-native`/`@shopify/
react-native-skia` were confirmed traced back to the P0 bootstrap commit via `git log
-p`, not just an empty `git diff main`); no injection surface in the new `exerciseId`
route param or the closed-enum range/metric selectors. One informational note flagged
a stale doc comment on `SqliteStatisticsRepository` incorrectly implying `exercise`
was filtered on `deleted_at` in `muscleGroupVolume` when it deliberately is not (a
soft-deleted exercise, never hard-deleted while any session still references it via
`ON DELETE RESTRICT`, correctly keeps its historical volume attribution) - fixed by
correcting the comment, not the (already-correct) query. Nothing else needed fixing.

P11 verification (all independently re-run by the orchestrator, not just
agent-reported): `npx tsc --noEmit` clean; `npx eslint .` clean (0 errors repo-wide,
only the same class of pre-existing `no-require-imports` warnings in test files every
prior phase already has); full Jest suite: 135 suites, 1228 passed, 1 pre-existing
skip (up from P10's 123/1132 - 12 new suites: 5 domain, 1 repository, 3 component, 2
screen, 1 chart-adapter smoke test); `npx expo export --platform ios` bundled
successfully, used again as the build-verification proxy - no simulator/emulator/
dev-client available in this environment, the same constraint every phase since P4 has
flagged. A new project-owned Jest mock, `__tests__/__mocks__/victoryNativeMock.tsx`
(wired via `jest.config.js`'s `moduleNameMapper`, alongside the existing Reanimated/
Worklets mocks), stands in for `victory-native` in every test - the library's own
official Jest setup needs a WASM `CanvasKit` runtime and a non-default `testEnvironment`
(`jest-environment-node` rather than this project's existing one), a heavyweight,
repo-wide test-infrastructure change judged disproportionate since `components/charts`
is the only place `victory-native` is ever imported at all; mocking it there is
sufficient to test every card/screen that composes a chart without needing to verify
Skia's own pixel-level rendering, the same "test the call, not the animation frame"
precedent this project already applies to Reanimated. The performance benchmark suite
(`__tests__/database/benchmarks.perf.test.ts`) gained a new case against the existing
75,000-set fixture: `muscleGroupVolume` (4ms) and `exerciseProgression` (1ms) over a
one-year range, both far under the 150ms budget shared with the pre-existing one-year
volume aggregation case - directly satisfying `docs/ROADMAP.md`'s P11 acceptance line
("one year of volume aggregation completes within the benchmark bound on the
75,000-set fixture").

**Training calendar (P12):** `features/calendar/` fills the P2-era empty skeleton
directory - the same "empty skeleton to real implementation" framing P11 used for
`statistics` - and is the tenth real feature. It ships a monthly calendar with
per-day training intensity derived from volume, day cells showing which plan day was
used, month navigation, and a compact year heatmap view, reached from a new
"Training calendar" row on `ProfileScreen`.

`features/calendar/repository/{CalendarRepository.ts,SqliteCalendarRepository.ts}`
is a read model with no accompanying service - the same "flat DTOs, nothing to
validate" shape P10's `HomeDashboardRepository` and P11's `StatisticsRepository`
already established - exposing exactly two methods, `monthOverview(year, month)` and
`yearOverview(year)`. This resolves the `calendar --> workout-logging` edge
`docs/ARCHITECTURE.md` section 9.1 had drawn as real since before this feature
existed, the same way `docs/adr/0019-home-dashboard-read-model.md` already resolved
the equivalent `statistics --> workout-logging` edge: `calendar` never calls
`workout-logging`'s service layer, and instead reads `v_session_summary`/
`v_working_set` directly through its own repository. This decision - and the real
performance investigation that shaped its final query shape (below) - is recorded in
a new ADR, `docs/adr/0020-calendar-read-model.md`. `services/container.ts` gained
`calendarRepository` with no matching service, the ninth feature-repository pair
after P3-P11's profile/exercise-library/plans/workout-logging/records/
exercise-history/home/statistics ones.

The domain layer (`features/calendar/domain/`) is three pure calculators plus a
calendar-math primitives file, the same "duplicate, don't import" shape `statistics`'
own `localDate.ts` already established for the same structural reason (the
dependency graph forbids `calendar` from depending on `home` or `statistics`):
`generateMonthGrid(year, month)` gap-fills a full, Monday-anchored week grid in JS
over already-day-level data (`dateRangeBuckets.ts`'s "never a second hand-written SQL
date-bucket expression" precedent, applied here rather than imported, since
`CalendarRepository.monthOverview` only ever returns days that actually have a
session); `computeDayIntensities(rows, allLocalDates)` is a calendar-scoped
transcription of `yearlyHeatmapBinning.ts`'s quartile-binning math, generalized to
take an explicit date list so one function serves both the month and year views; and
`features/calendar/domain/localDate.ts` duplicates `statistics`' own calendar-math
primitives (`endOfMonth`, `addMonthsToLocalDate`, `isSameYearMonth`,
`generateDateRange` beyond what that file needed). A real, found-not-fixed-by-the-
finder gap surfaced in `generateMonthGrid`'s own doc comment during test-agent's
property-testing pass: the comment claimed the grid is "always... 35 or 42 cells,"
but a non-leap February whose 1st falls on a Monday (confirmed via 1993-02) needs
zero leading and zero trailing filler days and produces a valid, gap-free, correctly-
ordered 28-cell (4-week) grid - the code was never wrong, only the documented
invariant was incomplete, and it was off-limits for the implementing agents to touch
(the doc comment lives in a file the accessibility/test agents were not permitted to
edit that phase). Fixed as part of this documentation pass, not left as a follow-up:
`generateMonthGrid`'s doc comment now states the true invariant ("4 to 6 Monday-
anchored weeks, i.e. 28 to 42 cells") with the 1993-02 case named as the reason - a
trivial, logic-untouched doc-comment edit, the narrow exception this docs pass was
permitted. The property test itself was already corrected by test-agent (asserting
the true invariant plus a named regression case pinning 1993-02) before this pass
ever started.

A real, two-part performance investigation, in the same class of depth this
codebase's other phases' own technical write-ups already carry (P9's navigation-bug
investigation, P11's `victory-native` Jest-mock reasoning): both `yearOverview` and
`monthOverview` originally read `v_session_summary` and measured over budget against
the 75,000-set fixture - `yearOverview` 195-347ms, `monthOverview` (not separately
benchmarked, but manually timed once the same root cause was suspected) ~206-216ms,
both against the shared `< 150ms` one-year-range budget P11's own year-range queries
established. Root cause: `v_session_summary` is itself already a `GROUP BY s.id`
aggregate view over the entire `workout_session` table, so a caller's own
`WHERE local_date BETWEEN ? AND ?` filter never reaches the view's internal
aggregation - SQLite materializes/aggregates the whole fixture on every call
regardless of the requested range. `yearOverview`'s fix was a straightforward swap:
read `v_working_set` directly instead, the exact query shape
`SqliteStatisticsRepository.yearlyHeatmap` already uses one call away - measured
post-fix at 1-2ms. `monthOverview` could not take the same swap verbatim, since its
DTO needs per-session `plan_day_name_snapshot`, data that lives only on
`workout_session`, not on the per-working-set `v_working_set` view. Two approaches
were tried and rejected before the shipped one: reading `workout_session.
total_volume_kg` directly (the cheapest possible read, no aggregation at all) was
rejected because that denormalized column is only ever populated by a real `finish()`
call, and the repository's own test fixtures construct `completed` sessions directly
without going through `finish()` - it broke 2 of 16 repository tests with a `0`
volume where a real one was expected, and fixing the live-volume convention to match
a test shortcut (rather than the other way around) was rejected as the wrong
direction to bend; a `LEFT JOIN v_working_set ... GROUP BY ws.id` (structurally the
same computation `v_session_summary`'s own view definition already does, just
written directly) measured ~145-155ms, barely inside budget and failing on some
runs - `EXPLAIN QUERY PLAN` showed SQLite choosing to fully materialize
`v_working_set` before ever applying the outer `local_date` filter, since joining it
a second time against `workout_session` gave the planner two copies of that table to
reconcile. The shipped fix is a correlated scalar subquery into `v_working_set`,
evaluated per outer `workout_session` row rather than joined-then-grouped:
`SELECT ws.id, ws.local_date, ws.plan_day_name_snapshot, (SELECT COALESCE(SUM(vws.volume_kg), 0) FROM v_working_set vws WHERE vws.session_id = ws.id) AS total_volume_kg FROM workout_session ws WHERE ws.status = 'completed' AND ws.deleted_at IS NULL AND ws.local_date BETWEEN ? AND ? ORDER BY ws.local_date ASC`

- `EXPLAIN QUERY PLAN` confirmed `SEARCH ws USING INDEX ix_session_local_date` as the
  first step (the partial index `database/schema.sql` already built for "History list,
  calendar, streaks, weekly summary"), filtering `workout_session` down to the handful
  of in-range sessions before `workout_set` is ever touched, then a per-matched-session
  indexed subquery search. Measured post-fix: 0ms on the fixture. No production
  behavior change beyond query source - both methods' DTO shapes, filtering semantics,
  and volume-derivation formula are unchanged; only the SQL query source and join/
  subquery shape changed, re-verified by the unchanged repository test suite passing
  against both the before and after query.

The UI layer: `CalendarScreen` (`features/calendar/screens/CalendarScreen.tsx`) is a
month/year `SegmentedControl` toggle with prev/next-month navigation via
`addMonthsToLocalDate` (local component state seeded from the injected `Clock`, not a
route param - this screen has exactly one entry point and nothing deep-links into a
specific month yet); the gap-filled grid always renders, per `generateMonthGrid`'s
own "renders cleanly even with an empty repository result" contract, with a real
`EmptyState` block rendered additively alongside it (never replacing it) when a month
has zero trained days - satisfying the roadmap's "a month with no workouts renders
cleanly" acceptance line without a blank-grid special case. Day-tap routes straight
to `history/[sessionId]` for a single-session day, or opens
`CalendarDaySessionPicker` (an in-place sheet on the existing `SheetHost`/
`BottomSheet`/`sheetStore`, no new sheet mechanism) for the rare multi-session day.
The components (`CalendarMonth`, `CalendarDayCell`, `CalendarLegend`,
`CalendarDaySessionPicker`, `CalendarYearHeatmapCard`) are new; the last one reuses
`components/charts/HeatmapView` verbatim for the compact year view rather than a
second heatmap renderer, mirroring `YearlyHeatmapCard.tsx`'s P11 wiring almost
exactly. Navigation wiring: `app/profile/calendar.tsx` (a thin wrapper, matching
`app/profile/history.tsx`'s exact shape), `routes.profile.calendar()` in
`navigation/routes.ts`, and a new "Training calendar" `ListRow` on `ProfileScreen`
between "Training history" and "Settings." The `['calendar', year, month]`/
`['calendar', 'year', year]` query-key family `docs/ARCHITECTURE.md` section 12.1
already anticipated needed no new invalidation wiring - `finishWorkout`'s
`['calendar']`-prefixed invalidation was already present since P9, in anticipation of
this feature, confirmed by reading the file rather than assumed.

Two small, mechanical findings were caught and fixed in a coordinator diff review
before handoff to test-agent, the same "pre-commit catch-and-fix" precedent P9's own
`/code-review high` paragraph established: `CalendarScreen.tsx`'s month-anchor
initializer called `new Date()` directly instead of going through the injected
`Clock`, fixed to `startOfMonth(clock.localDate())` (matching `useStatisticsDashboard`/
`useHomeDashboard`'s existing convention); and a 5-entry intensity color ramp was
duplicated verbatim across `CalendarDayCell.tsx` and `CalendarLegend.tsx`, extracted
to a shared `features/calendar/components/calendarIntensityColors.ts`.

An accessibility review (`reports/accessibility-2026-08-19-p12.md`, general-purpose
agent standing in for the accessibility-agent role, the same substitution P7-P11 used)
found no BLOCKING finding - the `SwipeableRow`-collapse bug class that blocked P7/P8
is confirmed absent (`grep -rn "SwipeableRow" features/calendar
app/profile/calendar.tsx` returns zero matches; the primitive is never imported
anywhere in this feature, and every interactive control is already the outermost
accessible node in its own subtree with nothing composed underneath it that could be
swallowed). Two real, non-blocking findings were found and fixed within the same
pass: `CalendarMonth`'s weekday header row exposed seven individually-focusable,
context-free "Mon"/"Tue"/... swipe stops instead of one meaningful summary
(A11Y-P12-001, MEDIUM - fixed by making the header row's container `accessible` with
a real, translated `accessibilityLabel`, "Days of the week, Monday through Sunday");
and `CalendarScreen` announced the month view's empty state but never the year view's

- an asymmetry within the same file/diff, the same recurring "one screen announces,
  its sibling in the same diff doesn't" class A11Y-P9-*/A11Y-P10-001 already established
  (A11Y-P12-002, HIGH - fixed by adding a third `useEffect` branch announcing
  `t('calendar.yearHeatmap.emptyTitle')` when the year view resolves empty). Both fixes
  were verified with a real before/after RNTL mount, not just a code re-read; both
  regression tests were added afterward by test-agent once free (the accessibility
  review was explicitly told not to touch `__tests__/` while test-agent was
  concurrently active there). One LOW/informational note was recorded, not fixed:
  `CalendarDaySessionPicker`'s rows are titled only by plan-day name (or a generic
  "Workout" fallback) with no time-of-day disambiguator, so two same-day sessions using
  the same plan day render two identically-labeled rows - both fully reachable and
  correctly labeled with the information the component has, but a real data/UX gap
  (`CalendarDayDto` carries no session start time today) left for a future product
  decision rather than a mechanical accessibility fix. A second, unrelated minor
  finding surfaced by test-agent rather than the accessibility review:
  `monthOverview`'s post-fix query has no secondary tiebreaker for two sessions sharing
  a `local_date`, so a same-day multi-session picker's row order is SQL-implementation-
  defined rather than guaranteed - resolved by reworking the affected repository test
  to assert the actually-documented invariant (each `sessionIds[i]` pairs with the
  correct `planDayNames[i]`) independent of ordering, rather than by adding an
  `ORDER BY` tiebreaker the repository's own DTO contract never promised; a future pass
  touching `features/calendar/` can add a deterministic `ORDER BY started_at ASC` if
  picker-row order ever needs to stop being incidental.

A security review (`reports/security-2026-08-19-p12.md`, security-agent-sonnet,
routine scope) found zero critical/high/medium/low findings and three informational
notes: both repository methods are fully parameterized with no template-literal
interpolation of `year`/`month` (or any derived date string) into SQL text anywhere in
the file; `deleted_at`/`status = 'completed'` filtering is fully inherited from
`v_session_summary`'s own `WHERE` clause with no redundant re-filtering or bypass path
in the pre-fix queries the report reviewed (the post-fix `monthOverview` query moved
to querying `workout_session` directly with its own explicit `status`/`deleted_at`
filter, carrying the same guarantee forward - re-confirmed by the unchanged repository
test suite, not a fresh review pass); and `year`/`month` are traced end-to-end as
locally-derived calendar-navigation state (never a route param, form field, or deep
link), with the SQL binding staying parameterized regardless of the input's
trustworthiness either way. `services/container.ts`'s new `calendarRepository` member
is additive-only, no existing line modified. Nothing blocked commit.

P12 verification (all independently re-run by the orchestrator, not just
agent-reported): `npx tsc --noEmit` clean; `npx eslint .` clean (0 errors repo-wide,
only the same class of pre-existing `no-require-imports` warnings in test files every
prior phase already has); `npx prettier --check` clean; full Jest suite: 144 suites,
1317 passed, 1 pre-existing skip (up from P11's 135/1228 baseline by exactly 9 new
suites and 89 new tests: 5 domain, 1 repository, 4 component/screen suites, plus one
new benchmark case inside the pre-existing `benchmarks.perf.test.ts`); `npx expo
export --platform ios` bundled successfully, used again as the build-verification
proxy - no simulator/emulator/dev-client available in this environment, the same
standing constraint every phase since P4 has flagged. Per Step 0, the dev-client
build-verification question was re-offered to the user this phase (per the
`feedback_build_verification` memory) and re-deferred again, the same decision made
every phase since P4 - EAS cloud build stays available but unused. No new npm
dependency this phase.

**Post-P12 bugfix pass (2026-08-19/20):** the first time this project has had real
on-device verification of any kind - every phase's own verification note since P4 has
flagged "no simulator/emulator available in this environment" and fallen back to
`npx expo export --platform ios` bundling as a proxy, which only proves the bundle
builds, not that it runs. This pass closes that gap, at least for Android: a
lightweight Android SDK (`android-commandlinetools` cask, one arm64-v8a API 34 system
image, `gymtracker_test` AVD) was installed locally, the existing EAS dev-client APK
(build `84c9c4cc-ecc6-49bf-8840-0e70c4fcef86`, from the prior `fix/expo-doctor-sdk-sync`
session) was run against a live Metro dev server on the emulator, and a full manual
A-to-Z walkthrough of every screen and flow - triggered by a user bug report that
started as three items (keyboard covers a text input, "something went wrong" after
typing a plan name, crooked icons/buttons) and was explicitly widened by the user
mid-session to a full sweep - surfaced 13 real bugs, several severe enough that no
amount of static review or mocked-Reanimated Jest testing could have caught them. iOS
remains unverified; this pass is Android-only. No feature work, no roadmap phase, no
architectural change - a pure bugfix pass, and per explicit user instruction this pass
wrote no new tests as a matter of policy (see the roadmap backlog note below), though
two of the ten fixes below picked up real regression coverage anyway, as a side effect
of the implementing agents verifying their own fix rather than a deliberate test-writing
step.

`database/client.ts`'s `openDatabase()` was the first and highest-priority fix, found
before the emulator was even running: the app suffers a native crash (SIGABRT, heap
corruption - `adb logcat` tombstones showed `Scudo ERROR: invalid chunk state when
deallocating`, crashing inside `exsqlite3_finalize` called from
`SQLiteModule.closeDatabase`) on Android whenever `expo-sqlite`'s native module closes
a database connection while the schema's `exercise_fts` FTS5 virtual table exists. This
app's own code never calls `closeAsync()` (confirmed via `grep -rn "closeAsync"`
returning nothing) - the close is triggered by `expo-sqlite`'s own internal connection
cache tearing down and reopening on a Metro Fast Refresh / dev-client JS-context reload,
independent of app code. This is a confirmed, documented upstream bug,
[expo/expo#38168](https://github.com/expo/expo/issues/38168): the default close path
walks every open statement via `sqlite3_next_stmt` and finalizes it directly, but an
FTS5 virtual table finalizes its own internally-owned statements as part of its own
`sqlite3_close()` cleanup, so the walk's finalize and the virtual table's own finalize
double-free the same statement. Reproduced locally at 100% across multiple clean
force-stop-then-single-launch-then-reload cycles. Fixed per the upstream issue's own
documented workaround - `SQLite.openDatabaseAsync(name, { finalizeUnusedStatementsBeforeClosing: false })`

- which skips the pre-close finalization walk and leaves cleanup entirely to SQLite's
  own `sqlite3_close()`, which does not re-finalize the virtual table's statements. This
  is very likely the actual root cause of the user's originally-reported "something went
  wrong after typing a plan name" - allocator/GC-timing-dependent per the same GitHub
  issue's comments, so on a real device the same double-free could plausibly corrupt heap
  state silently rather than crash immediately, surfacing later as a generic error on an
  unrelated SQLite operation. Dev-mode/Fast-Refresh-specific; should not affect a shipped
  production build the same way, since no JS reload happens there after initial launch.

`components/feedback/BottomSheet.tsx`'s keyboard-covers-content bug (the user's other
original report) took three attempts to actually fix, each verified live rather than
assumed - worth recording at the same depth this file's other multi-attempt
investigations (P9's `PlanDayPickerScreen` navigation bug) already get. The component
had zero keyboard-avoidance code to begin with: it rendered a raw RN `Modal` with a
bottom-pinned `Animated.View`, and `components/layout/KeyboardAvoider.tsx` (dead code,
never imported anywhere) would not have helped regardless, since it wraps content
_outside_ a `Modal`'s tree, which has no effect on content rendered _inside_ one.
Attempt 1 wired `useAnimatedKeyboard` directly and failed live: on Android, `Modal`
renders into its own native window (`ReactModalHostView.kt`'s own `Window`/
`DialogRootViewGroup`), while `useAnimatedKeyboard`'s Android implementation
(`WindowInsetsManager.kt`) attaches its listener to `currentActivity.window.decorView`

- the main Activity window, not the Modal's separate Dialog window - so it never
  observed this sheet's real keyboard animation at all. Attempt 2 tried measuring the
  sheet's own `onLayout` against `Dimensions.get('window').height` instead, on the theory
  that the Dialog window's `SOFT_INPUT_ADJUST_RESIZE` would resize it by the keyboard's
  full height; verified live to only shift by ~100-150px against a keyboard needing
  ~900px - the Dialog window did not reliably resize by the assumed amount. A working
  control case, `OnboardingScreen`'s nickname field (not inside any `Modal`, correctly
  avoids the keyboard with zero special handling), confirmed the defect was specifically
  RN `Modal`'s separate window, not Reanimated or this app's general keyboard setup.
  Attempt 3, the one that shipped: remove `Modal` entirely and render the sheet as a
  plain absolutely-positioned overlay inline in the same Activity window as the rest of
  the screen, the same window `OnboardingScreen`'s already-working field lives in - which
  makes `useAnimatedKeyboard` trustworthy on both platforms (it was never actually broken
  on iOS; `REAKeyboardEventObserver.mm` listens to app-wide `UIKeyboard*` notifications
  with no window affinity). Because `Modal` no longer provides three things for free,
  `BottomSheet.tsx` now provides them explicitly: a `BackHandler` listener (armed only
  while `visible`) replaces `Modal`'s own `onRequestClose` for the Android hardware back
  button; an explicit `zIndex: 1000` plus, Android-only, `elevation: 24` (above every
  other `elevation.*` token in `theme/tokens.ts`, including `elevation.sheet`'s own 12
  used on the sheet surface itself) replaces the automatic stacking a separate native
  window used to provide; and `accessibilityViewIsModal` stays on the sheet's own
  `Animated.View`, which iOS still honors with no `Modal` wrapper needed, while Android
  has no equivalent and is left as a documented, known gap (touch is still blocked by the
  full-screen backdrop `Pressable`, only TalkBack's explore-by-touch could in principle
  still reach hidden content underneath - flagged for a future accessibility pass, not
  silently dropped). This is the single BottomSheet implementation every consumer app-wide
  shares (rest-timer-settings, exercise-picker, `CalendarDaySessionPicker`, plan create/
  rename), so the fix landed once and fixed the keyboard behavior everywhere, verified
  live end to end: `PlanListScreen`'s create sheet fully visible above the keyboard, plan
  created successfully.

`app/(tabs)/_layout.tsx`'s Profile tab showed Home's house icon instead of a person
icon - a `TAB_ICONS` key mismatch. `app/(tabs)/profile/` has no nested `_layout.tsx` of
its own (still a single flat screen, unlike `plans`/`exercises`/`stats`, each of which
became a real nested Stack navigator in its own phase), so Expo Router resolves its
`route.name` to the literal leaf path `"profile/index"`, not the bare `"profile"` the
lookup table was keyed on - falling through to the icon map's own `?? TAB_ICONS['index']`
fallback and silently rendering Home's icon instead. Fixed by keying the entry
`'profile/index'` instead, with a comment flagging that a future nested layout for
Profile would need the plain `'profile'` key added back alongside it.

`services/id/Uuid7IdGenerator.ts` crashed Home's "Quick Start" button 100% of the time
on a fresh install - the fifth bug found, and only reachable once the SQLite crash
above was fixed. `generate()` called `crypto.getRandomValues` with no polyfill anywhere
in the project's dependency tree (no `expo-crypto`, no `react-native-get-random-values`,
nothing). This was never exercised by Jest, since Node's own Web Crypto global (stable
since Node 19) is always present under `node:sqlite`-backed tests - masking the gap
through every prior phase's verification. On real Android/Hermes it is not guaranteed,
and `Uuid7IdGenerator.generate()` was, until this pass, the only production code path
in the app that ever called `crypto.getRandomValues` at all (every other write path
either uses a fixed literal id, like `user_profile`, or `database/ids/uuidv7.ts`'s own
separate `Math.random()`-based helper for catalog seeding). Fixed by reading `crypto`
off `globalThis` (a direct bare `crypto` reference would throw a `ReferenceError` on a
runtime with no such global at all, uncatchable by an optional-chain on the identifier
itself) and falling back to a `Math.random()`-based `fillWithInsecureRandomBytes` when
`getRandomValues` is absent - deliberately not cryptographically secure, since
UUIDv7's leading 48 bits already carry the id's required time-ordering (ADR-0002) and
the remaining bits only need collision-resistance, not unpredictability, for an
offline, single-local-user app using these ids purely as opaque primary keys. Verified
live: Quick Start now successfully creates and enters a workout session on-device.

`features/workout-logging/components/WorkoutHeader.tsx` had its content overlapping
the Android status bar on `ActiveWorkoutScreen` - reachable, and found, only once the
Quick Start fix above let the sweep reach this screen at all. Root cause:
`ActiveWorkoutScreen.tsx` deliberately does not render through `components/layout/Screen`
(its `RestTimerBar`/`FlashList` rely on edge-to-edge layout `Screen`'s padding
behavior would disturb), so nothing on this one root-level route (`app/workout/`,
outside `(tabs)`, per ADR-0007) ever cleared the status bar the way every tab screen
does automatically through `Screen`. Fixed by having `WorkoutHeader` read
`useSafeAreaInsets()` directly and fold `insets.top` into its own top padding - the
same pattern `BottomSheet.tsx` already uses - scoped to this one component rather than
a shared-primitive change. `ActiveWorkoutScreen.tsx` itself picked up the same
treatment at its bottom edge in the same pass, folding `insets.bottom` into the
padding around its "add exercise" button so that control clears the Android
gesture-navigation bar rather than sitting flush against it.

Migrating three Plans screens off inline `BottomSheet` and onto the existing
`sheetStore`/`SheetHost` mechanism fixed a sixth bug, found only after the third
`BottomSheet` fix above landed: with a workout minimized (`ActiveWorkoutBanner` docked
above the tab bar), opening a sheet from a tab screen rendered it _behind_ the banner -
confirmed via screenshot, the sheet's own label visibly peeking out from underneath.
`ActiveWorkoutBanner` mounts as a sibling of the entire `<Tabs>` navigator in
`app/(tabs)/_layout.tsx`, outside and after whatever tree a tab screen's own inline
`<BottomSheet>` render lived in - `zIndex`/`elevation` only reorder siblings sharing the
same parent, so no `zIndex` on the sheet itself could ever win across that tree
boundary (a real `Modal`'s separate native window used to sidestep this for free; the
Modal-removal fix above closed the keyboard bug but reopened this one). Fixed not by
patching around the symptom but by routing through the mechanism the app already had
for exactly this - `sheetStore.present()`/`SheetHost`, already used by
`exercise-library`'s filter sheet and `calendar`'s `CalendarDaySessionPicker`, mounted
at the true app root above `ActiveWorkoutBanner` in the tree. `PlanListScreen.tsx`
(create/rename), `PlanDetailScreen.tsx` (rename), and `PlanDayEditorScreen.tsx`
(exercise edit) all previously owned their sheet's open/closed state and form fields
directly; each now calls `useSheetStore.getState().present({ id, content, snapPoints })`
with a new, self-contained content component instead - `PlanNameSheetContent.tsx`
(shared by both create and rename, mode-switched via a `mode: 'create' | 'rename'`
prop), `PlanDetailNameSheetContent.tsx`, and `PlanDayExerciseEditSheetContent.tsx`, all
three new files under `features/plans/components/`. Each owns its own local form state
and calls its own mutation hook directly rather than reading them from the presenting
screen, the same "sheet content owns whatever can change while it's open" shape
`CalendarDaySessionPicker` already established - necessary because `sheetStore`'s
`content` is a `ReactNode` frozen at `present()` call time, so a screen-level `useState`
update after that point would never reach an already-rendered sheet element. Verified
live: opening the plan create sheet with a workout minimized now renders correctly
above the banner.

`features/workout-logging/screens/ActiveWorkoutScreen.tsx`'s multi-select "add
exercise" during a live workout only ever added one exercise, the seventh bug found -
the exact same bug class this file's own P9 write-up already documents as fixed once
before, in `PlanDayEditorScreen`'s equivalent flow, just never caught in
`ActiveWorkoutScreen`'s own copy of the same pattern: `AddExerciseButton`'s
`onSelect` called `exerciseIds.forEach((exerciseId) => void addExercise(...))`, an
unawaited `forEach` racing N concurrent transactions against the same session's
`sort_order` column. Fixed the same way P9 fixed it the first time - sequential
`await`s in a `for...of` loop instead of an unawaited `forEach` - so N exercises added
at once land as N ordered writes, not a race. Verified live: a 4-exercise multi-select
add landed all four, in order.

`components/gestures/SwipeableRow.tsx` was the single most severe finding this pass: a
`[Worklets] Cannot copy value of type FiberNode` render crash, reproduced on a clean
cold boot (not a Fast Refresh artifact, so this was not merely dev-mode-adjacent the
way the SQLite crash above was) that broke every one of `SwipeableRow`'s three real
consumers - `SetRow` (the core "log a set" row, i.e. the app's central workout-logging
interaction), `RestTimerBar`, and `SupersetGroupEditor` - and had sat latent through
P6-P12 undetected, since no prior phase ever had a device to catch it on. Root cause:
the `Gesture.Pan()` worklet's `.onUpdate`/`.onEnd` callbacks referenced the full
caller-supplied `leftAction`/`rightAction` objects directly, even just for a bare
`!== undefined` existence check - and referencing an object anywhere inside a worklet
body forces Reanimated's Worklets runtime to serialize the _entire_ object into its
UI-thread closure, not just the field actually read. `SetRow`'s own `leftAction`/
`rightAction` carry an `icon: <Ionicons .../>` field - a JSX `ReactNode` element
carrying unserializable dev-mode fiber/owner references - so any worklet touching the
action object at all pulled that unserializable icon along with it and crashed. Fixed
by deriving plain, worklet-safe values outside the worklet - `hasLeftAction`/
`hasRightAction` (booleans) and `leftOnTrigger`/`rightOnTrigger` (bare function
references pulled off the objects once, outside the worklet) - and referencing only
those inside `.onUpdate`/`.onEnd`, so the worklet closure never captures the action
object or any `ReactNode` again. Worth stating plainly: this is exactly the class of
bug only a real device/emulator run could have caught - every existing
`SwipeableRow`-related Jest test mocks Reanimated entirely, so none of them ever
exercised the real Worklets serialization path this crash lived in. Verified live: a
cold-boot resume into a session with a real exercise and set rendered `SetRow` with no
crash, the swipe gesture worked, and a 4-exercise multi-select add (verifying the
bug-7 fix above in the same pass) landed correctly.

`app/(modals)/exercise-picker.tsx` produced a dev-only "GO_BACK was not handled by any
navigator" warning - non-data-corrupting (the mutation always succeeded and the screen
did visually return) but a real navigation-stack bug, the ninth found. It only
reproduced when the picker was opened from `ActiveWorkoutScreen` (a root-level
`fullScreenModal` route) rather than `PlanDayEditorScreen` (its only previously-
documented caller, per a since-corrected stale comment in the same file). Root cause:
a mount-time defensive `useEffect` (originally there only to back out if this route
were ever reached with no pending picker `request`, e.g. a stale deep link) depended
on `request` itself - and `onConfirm`'s own `close()` call nulls that same store field
right before its own `router.back()`, re-arming the effect's dependency and firing a
_second_, redundant `router.back()` immediately after the legitimate one. Harmless when
reached from a tab-nested screen (a second GO_BACK still finds a route to bubble to
above it), but a genuine failure when reached from a root modal route with nothing left
to pop once the first `back()` had already returned here. Fixed by gating the mount
effect on a `useRef` so it runs exactly once at mount, plus a defense-in-depth
`router.canGoBack()` guard on the confirm handler's own `back()` call, matching the
guard the mount effect already used.

`features/workout-logging/components/SetRow.tsx` and `features/workout-logging/hooks/
useDebouncedFieldCommit.ts` held the second most severe finding: typing a weight value,
then reps, then completing the set via its checkbox could silently lose the weight (or
any other field) entirely, reverting it to 0/default after completion while a
later-edited field correctly kept its own typed value - a real data-loss race, not a
cosmetic bug, in the app's core "log a set" flow. Root cause: `SetRow`'s checkbox
called `onComplete(set)` with no explicit values, so `CompleteSetValues` defaulted to
`{}` - the completion write never carried weight/reps/rpe/note at all, relying entirely
on each field's own independent 400ms-debounced `useDebouncedFieldCommit`-driven
`updateSet` write to have already landed. Both `useCompleteSet` and `useUpdateSet`
finish with a full-object-replace (`upsertSet`), not a merge, so two or more
independent async writes to the same row could resolve out of order and stomp each
other - a race only visible on-device, where real SQLite write latency lets the writes
genuinely overlap; invisible under Jest's synchronous/fake-timer execution. Fixed by
having `SetRow`'s completion handler (`handleComplete`) cancel each field's pending
debounce timer and pass the row's _current_ on-screen draft values (`weightDraft`/
`repsDraft`/`rpeDraft`/`noteDraft`) straight into `completeSet`'s own
`CompleteSetValues` - the one write that then atomically carries every field plus
completion together, rather than trusting four independent in-flight writes to land in
the right order. `useDebouncedFieldCommit` gained a third return value,
`cancelPending`, for this purpose - it clears the pending timer and drops
`hasPendingEdit` but deliberately leaves `lastSyncedValue` untouched (snapping it to
`draft` was tried first and found wrong: `lastSyncedValue` means "the last value we
actually observed `currentValue` hold," and the not-yet-committed `draft` was never
observed there - forcing them equal creates a false "the prop changed externally"
mismatch against the real, still-unchanged `currentValue` on the very next render,
snapping `draft` straight back down to the stale value it was supposed to escape; this
was caught by the hook's own test suite before it ever reached `SetRow` again). Verified
live: weight and reps both persisted correctly through completion, with the PR badge
firing correctly on the same pass.

Two additional findings were investigated but deliberately left as documented,
non-blocking known gaps rather than fixed this pass - see "Known gaps" below for both
(a dev-only unmounted-component warning with no screen-attributable root cause yet, and
`ActiveWorkoutBanner` not appearing on two of Profile's nested screens while minimized).

Verification for this pass (independently re-run, not just agent-reported):
`npx tsc --noEmit` clean; `npx eslint .` clean (0 errors repo-wide, 32 pre-existing
`no-require-imports` warnings, test files only, the same class every prior phase has
had); full Jest suite: 145 suites, 1321 passed, 1 pre-existing skip, 1322 total - up
from the P12 baseline (144 suites, 1317 passed) by exactly one new suite
(`useDebouncedFieldCommit.test.ts`) and 4 new/changed tests, picked up as a side effect
of the completion-race and BottomSheet-migration fixes being verified by their own
implementing agents, not a deliberate test-writing pass (see the roadmap backlog note
this pass adds). Every fix above was verified live on the `gymtracker_test` Android
emulator (arm64-v8a, API 34), not only by static analysis or mocked tests - this closes
the "no simulator/emulator available" gap every phase since P4 has flagged, at least
for Android; iOS remains unverified.

## Product

Offline-only React Native/Expo workout logging app. No backend, no accounts, no
cloud sync. Dark mode only. Bundle id `com.konradmalinowski.gymtracker`. Min OS: iOS
15+, Android 8 / API 26+. Package manager: npm.

## Stack

Expo + TypeScript (strict) + Expo Router (typed routes) + Zustand (ephemeral UI
state only) + TanStack Query + Expo SQLite + React Hook Form + Zod + MMKV (requires
`react-native-nitro-modules` as its native peer - a pod install/prebuild step
before the next device run) + FlashList (declared since P0, first actually used in
P4's exercise library results list) + Reanimated + Gesture Handler + Victory
Native XL (wrapped in a
`components/charts` adapter per ADR-0010) + React Native SVG + Expo Notifications +
Expo Haptics + Expo FileSystem + NativeWind (`tailwind.config.js` imports
`theme/tokens.ts`, never duplicates values) + `@expo/vector-icons` (Ionicons - the
app's only icon system, chosen in P3; every `ReactNode`-typed icon prop across
`components/ui` should move to it rather than a second icon system coexisting) +
`expo-image-picker` (avatar/photo selection) + React Hook Form's `@hookform/resolvers`
(Zod schema resolvers for form validation).

## Architecture and layering (section 3.1)

Clean Architecture, feature-sliced. Dependencies point inward only:
Presentation -> Application -> Domain <- Infrastructure. Four rules, all
mechanically enforced by `eslint.config.js` (a violation fails lint, not just a
convention someone might miss):

1. **Domain purity** - `domain/**` and `features/*/domain/**` must not import
   React, React Native, or Expo. Enforced by the `gymtracker/domain-purity` config
   block (`no-restricted-imports`).
2. **SQLite boundary** - `expo-sqlite` may only be imported from `database/` or a
   feature's `repository/*.ts`. Enforced by `gymtracker/sqlite-boundary`
   (`no-restricted-imports` banning the `expo-sqlite` path everywhere else, with
   `gymtracker/sqlite-boundary-exemptions` re-enabling it for those two locations).
3. **No direct repository access from presentation** - `app/`, `components/`, and
   any `features/*/screens` or `features/*/components` may not import
   `repositories/` or a feature's `repository/` directly; go through a feature
   service via a hook instead. Enforced by `gymtracker/architecture-layering`
   (`import/no-restricted-paths` zones).
4. **Cross-feature imports only through a barrel** - reaching into
   `features/x/internal-thing` from `features/y` is a lint error; import from
   `features/x` (its `index.ts`) instead. Enforced by the generated
   `crossFeatureBarrelZones` in the same `gymtracker/architecture-layering` block
   (one `import/no-restricted-paths` zone per feature pair).

Import cycles anywhere in the project are also banned (`import/no-cycle`, set to
`error`).

CQRS-lite: statistics/history read through dedicated read-model repositories
returning flat SQL-aggregated DTOs - never load-all-then-sum-in-JS. Aggregate
boundary: a workout session + its exercises + its sets is one repository, one
transaction.

## Folder structure (section 9)

`app/` (routing only), `assets/` (fonts, images, bundled exercise catalog/media),
`components/` (cross-feature, zero domain knowledge: `ui/`, `layout/`, `feedback/`,
`charts/`, `gestures/`), `database/` (`client.ts`, `DatabaseProvider.tsx`,
`migrations/`, `schema.sql`, `seed/`, `sql/`), `domain/` (shared cross-feature value
objects - see note below), `features/` (one directory per feature - see the list in
the dependency graph section - each with `components/hooks/screens/services/domain/
repository/types/index.ts`), `hooks/`, `navigation/`, `repositories/` (shared infra:
`contracts/`, `base/`, `mapping/`, `query/`), `services/` (`container.ts` composition
root, `files/`, `notifications/`, `haptics/`, `kv/`, `clock/`, `id/`, `logging/`),
`stores/` (Zustand, ephemeral UI state only), `theme/`, `types/`, `utils/`,
`__tests__/`, `.maestro/`.

Two load-bearing rules, both worth restating because they're easy to violate by
accident:

- `app/` never contains screen bodies - only thin wrappers into `features/*/screens`.
- `components/` may never import from `features/` (enforced, see rule 1 above).

**Deviation from the section 9 tree**: a project-root `domain/` folder exists for
`Weight.ts` and `Length.ts` - value objects shared across multiple features
(workout-logging, body-metrics, statistics) with no single natural owner. Not
explicitly in the original architecture doc's tree, but consistent with its intent;
`@/domain/*` is a real tsconfig path alias and the domain-purity ESLint rule covers
it. Not yet reflected back into `docs/ARCHITECTURE.md` section 9 (cosmetic doc-sync
item, non-blocking).

## Module dependency graph (section 9.1)

- `exercise-library` is a leaf: no dependency on `plans`, `workout-logging`, or
  `records`.
- `plans` depends on `exercise-library` only.
- `workout-logging` is the hub: depends on `exercise-library`, `plans`,
  `rest-timer`, `records`. Nothing depends on `workout-logging` except read-side
  features (`statistics`, `calendar`, home, `data-transfer`).
- `rest-timer` and `records` do **not** depend on `workout-logging` - they are
  called by it. Inverting this creates a cycle.
- `statistics` depends only on read models.
- `data-transfer` depends on everything and is built last.
- `daily-goals` is also a leaf, deliberately isolated: no dependency on `plans`,
  `workout-logging`, or `exercise-library` - goals are user-defined and must not be
  tied to training days or workout state. `home` is its only dependent, via a summary
  card (P17, documentation-only so far - see "Status" above).
- `home` (P10) depends on `workout-logging`, `plans`, and `records` - read-only, one
  direction, nothing depends back on `home`. It does not depend on `statistics` in
  practice, despite `docs/ARCHITECTURE.md` section 9.1's diagram drawing a
  `HOME --> STAT` edge - `docs/adr/0019-home-dashboard-read-model.md`'s "P11
  resolution" settles this permanently: `home` keeps its own lightweight read model
  (`HomeDashboardRepository`) forever, since `statistics` (real as of P11) never
  implements `streak()`/`weeklySummary()` at all. The diagram's `HOME --> DG` edge is
  likewise still unbuilt, since `daily-goals` remains documentation-only (P17).
- `statistics` (P11, real as of this phase) depends only on read models, never on
  write services, with one real edge: `STAT --> REC`, `exerciseProgression`'s `e1rm`
  metric reusing `records`' pure `estimated1RM`/`isRecordEligibleSetType` domain
  calculator (not a call into any write service - a documented, deliberate,
  cycle-safe addition, the same class of judgment call P8's `records -> exercise-library`
  edge already established). It does not depend on `workout-logging` - its own
  repository reads `v_working_set`/`workout_session` directly, the same
  "read the shared view, don't call the write feature" shape `home` uses.
- `calendar` (P12, real as of this phase) likewise does not depend on
  `workout-logging` in practice, despite `docs/ARCHITECTURE.md` section 9.1's diagram
  drawing a `CAL --> WL` edge - `docs/adr/0020-calendar-read-model.md` resolves this
  permanently, the same way ADR-0019 already resolved the equivalent edge for
  `statistics`: `CalendarRepository` reads `v_session_summary`/`v_working_set`
  directly, never calling `WorkoutSessionService`. It has no edge to `statistics` or
  `home` either - its own intensity-binning and calendar-math primitives are a
  deliberate, small duplication of `statistics`' equivalents, not an import.

Thirteen features total: `onboarding`, `profile`, `exercise-library`, `plans`,
`workout-logging`, `rest-timer`, `records`, `home`, `statistics`, `calendar`,
`body-metrics`, `data-transfer`, `daily-goals`.

## Data layer (sections 7-8)

Built in P2 (persistence foundation) - `database/schema.sql` and
`database/migrations/001_initial.ts` implement the full schema from
`docs/ARCHITECTURE.md` section 7 in one migration (every table, index, and view),
applied through a migration runner over `PRAGMA user_version` with a
`migration_history` table and a forward-version guard. No feature repository lives
on top of this yet (that's each feature phase's job, one at a time); P2 shipped the
schema, the shared repository infrastructure, and the settings repository only.

- SQLite via Expo SQLite, UUIDv7 TEXT primary keys everywhere (sync-readiness).
- Timestamps: epoch ms UTC plus a separate `local_date` (`YYYY-MM-DD`) column on
  every entity the user perceives as "a day."
- Units always stored as kg (weight) / cm (length). Unit conversion happens **only**
  in `domain/Weight.ts` and `domain/Length.ts`, enforced by the
  `gymtracker/unit-conversion-boundary` ESLint block (`no-restricted-syntax`,
  banning the known kg<->lb and cm<->in conversion-factor literals - `2.20462`,
  `0.45359237`, `2.54`, `0.393701` - anywhere outside those two files, via
  `gymtracker/unit-conversion-boundary-exemptions`).
- Exercise catalog data (`exercise`) is separated from user data
  (`exercise_user_data`) so a catalog update never destroys favorites/notes.
- No `change_log` table or `findChangedSince()` - only sync-readiness primitives
  that pay for themselves today (ADR-0004).
- Three partial unique indexes enforce single-active-row invariants at the SQLite
  level: `ux_plan_single_active`, `ux_session_single_in_progress`, `ux_pr_current`
  (`docs/ROADMAP.md`'s P2 prose says "two" - section 7 of
  `docs/ARCHITECTURE.md` is the authoritative source and defines three; the
  roadmap wording is stale).
- `database/client.ts` opens the connection with WAL journaling, `synchronous=FULL`,
  `foreign_keys=ON`, a busy timeout, and `temp_store=MEMORY`, and exposes
  `ExpoSqlExecutor`. `database/node/NodeSqlExecutor.ts` runs the same schema on
  `node:sqlite` for tests/CI/benchmarks - chosen over `better-sqlite3` to avoid a
  native compile step (CI already pins Node 24 for `node:sqlite` support).
- `database/diagnostics.ts` reports schema version, per-table row counts, file size,
  `PRAGMA integrity_check`, last migration, SQLite version/compile options, and
  FTS5/partial-index availability - backs the `/dev/db-health` route.
- `repositories/contracts/` defines `SqlExecutor`/`DatabaseContext`/
  `ReadRepository`/`WriteRepository` (section 8.2). `repositories/base/
BaseSqliteRepository` handles id generation, audit stamping, injected-`Clock`
  `local_date` computation, and generic soft delete/restore/purge.
  `repositories/mapping/` holds case-conversion and bool/JSON codecs.
  `repositories/query/` provides a parameterized `WhereClause`, a whitelisted
  `orderBy`, and clamped limit/offset.
- `repositories/settings/SqliteSettingsRepository` covers all 15 v1 settings keys
  (14 from P2 plus `haptics.enabled`, added in P3), Zod-validated with
  default-fallback on a missing or corrupt stored value. It sits
  as a top-level sibling of `repositories/{base,mapping,query}` rather than under a
  feature - cross-cutting, and it doesn't fit the `ReadRepository`/`WriteRepository`
  shape - the same kind of deviation as the root `domain/` folder noted above.
- `services/container.ts` (`AppContainer`/`createContainer`/`ContainerProvider`/
  `useContainer`) is the composition root. It's deliberately smaller than section
  8.4's full shape - `profileRepository`/`profileService` (P3) and
  `exerciseRepository`/`exerciseService` (P4) are the first two feature repository
  pairs to land; the rest (`plans`, `sessions`, etc.) don't exist yet and land one at
  a time from P5 onward, each phase extending `AppContainer` rather than replacing
  it. `services/kv` is intentionally not a container member (ADR-0008: MMKV holds
  boot-critical flags read before the database opens).
- Exercise catalog: `scripts/build-catalog.ts` fetches from `yuhonas/free-exercise-db`,
  downscales imagery to 512px WebP via `sharp`, content-hash-dedupes, and emits
  `assets/data/exercises.catalog.json` (deterministic, Zod-validated) plus empty
  `exercises.pl.json`/`exercises.videos.json` overlays for a future phase to fill.
  `CATALOG_VERSION` is currently hardcoded `"1"`. An idempotent, versioned
  `catalogSeeder` loads the catalog into the DB without touching
  `exercise_user_data`.

## Testing strategy (section 14)

Domain layer: property-based tests (fast-check) for calculators - highest-value
tests in the app. Repository layer: integration tests against real `schema.sql` via
`NodeSqlExecutor` (`node:sqlite`), not mocks - chosen over `better-sqlite3` to skip a
native compile step. Component layer: React Native Testing Library. E2E: Maestro.
`jest.config.js` + `jest-expo` are already wired (P0); `domain/Weight.ts` already has
real fast-check property tests, not filler. `__tests__/database/benchmarks.perf.test.ts`
is a CI performance-regression suite (ADR-0014) with real assertions for what P2
ships (previous-performance lookup, session detail load, one-year volume
aggregation) plus, as of P4, the exercise-search benchmark (~900-row fixture,
sub-50ms, NFR-03) - previously `test.skip`'d, now implemented and passing. One
benchmark remains `test.skip`'d with a comment naming its future phase (JSON export

- P9), not silently omitted.

## Tooling and CI (section 15, built in P0)

- ESLint flat config (`eslint.config.js`) with the layering rules above, Prettier,
  Husky + lint-staged + commitlint.
- **Conventional Commits are enforced by a hook, not just convention.** The
  `commit-msg` hook runs `commitlint` against `commitlint.config.js`
  (`@commitlint/config-conventional`, 120-char header limit) and rejects a
  malformed commit outright. The `pre-commit` hook runs `lint-staged` (ESLint +
  Prettier on staged files) first.
- GitHub Actions (`.github/workflows/ci.yml`) runs `typecheck`, `lint`,
  `format:check`, `test:ci`, `expo-doctor`, and `audit:ci` (`npm audit
--audit-level=high`) on every push/PR to `main`.
- EAS project registered (`@konradxmalinowski-2/gymtracker`, `app.config.ts`'s
  `owner` and `extra.eas.projectId` - the owner moved off `konradxmalinowski` onto
  a second account, projectId `9c25b5d1-7371-49ec-aaee-f6884a31e820`), `eas.json`
  has `development`/`preview`/`production` build profiles.
- Sentry (`@sentry/react-native`) config plugin is wired unconditionally in
  `app.config.ts`, but crash reporting defaults to **off** and no DSN is committed
  (read from `SENTRY_DSN`, unset in this repo and in CI). The user-facing toggle
  and the only `Sentry.init()` call site land in P15 (settings) - do not add error
  boundaries or capture call sites before then, there's no feature code to
  instrument yet.

## Known gaps (tracked, non-blocking)

- **`dragHandle="handle"` mode's grip is nested inside each row's own
  already-`accessible` container (`PlanCard`/`PlanDayCard`/
  `PlanDayExerciseRow`, all three P5 `DraggableList` consumers), which may
  make the handle - and, by the same mechanism, each row's own nested icon
  buttons (rename/duplicate/delete/set-active/ungroup/remove) - unreachable
  as independent VoiceOver/TalkBack stops. Every one of these three row
  components sets `accessibilityRole="button"`/`"checkbox"` plus an
  `accessibilityLabel` directly on its own outer `PressScale`, independent
  of anything `DraggableList` clones onto it - so the row was already a
  single accessible unit by construction, before the move-up/move-down fix
  below ever touches it. `DraggableList.tsx`'s move-up/move-down actions
  are attached to the handle node itself in `"handle"` mode (not to the
  row) specifically to avoid _compounding_ this with a second collapse
  point, but that placement does not resolve the pre-existing one: RN
  Testing Library's tree inspection reads component props directly and
  cannot simulate the native accessibility engine's subtree-collapsing
  behavior, so this cannot be confirmed or ruled out without a real device
  (VoiceOver/TalkBack or the platform accessibility inspectors) - the same
  category of unverifiable-via-RNTL claim `SwipeableRow.tsx`'s own A11Y-004
  finding already established for this codebase. If real, the fix is
  structural (stop wrapping the entire row - including its trailing icon
  buttons and the drag handle - in one `accessible` `PressScale`; split the
  row so only the "navigate to detail" tap target carries the row-level
  role/label, leaving the handle and each icon button as independent,
  un-collapsed accessible elements), not a prop tweak - do not attempt that
  restructuring without on-device verification first, to avoid trading a
  confirmed-safe layout for an unverified one. Source: accessibility audit
  finding A11Y-P5-002, `reports/accessibility-2026-08-06-p5.md`.

- **`components/gestures/DraggableList.tsx` had no non-gesture reorder
  alternative.** ~~It is gesture-only today~~ **Resolved as of P5**: every row
  now exposes a move-up/move-down `accessibilityActions` pair
  (`attachMoveActions`, mirroring `SwipeableRow`'s `cloneElement`-based
  merge), and - after a follow-up accessibility review caught the fix not
  actually reaching a native node through any of P5's three real screens
  (`PlanCard`/`PlanDayCard`/`PlanDayExerciseRow` had closed prop interfaces
  with no accessibility pass-through, and neither did the `PressScale` they
  render onto) - `components/gestures/PressScale.tsx` and those three row
  components now accept and forward `accessible`/`accessibilityActions`/
  `onAccessibilityAction`, and `SupersetGroupEditor.tsx` forwards them onto
  its wrapped child rather than dropping them a fourth time. Verified via
  integration tests that mount `DraggableList` with the real row components
  (`__tests__/features/plans/components/{PlanCard,PlanDayCard,
PlanDayExerciseRow}.test.tsx`), not just a synthetic `<Text>` stand-in -
  the exact regression class the first pass's own unit tests missed.
  Original source: accessibility audit finding A11Y-005,
  `reports/accessibility-2026-08-05-p1.md`; follow-up finding A11Y-P5-001,
  `reports/accessibility-2026-08-06-p5.md`. See the gap entry above this one
  for a related, still-open, device-unverified concern this fix did not
  (and structurally could not, without a device) resolve.

- **`features/workout-logging/components/SetRow.tsx`'s checkbox/weight-field/
  reps-field/focus-button group is the same `SwipeableRow`-collapse shape the
  gap entry above this one describes for `DraggableList`'s row consumers, on
  the same `SwipeableRow` primitive `SwipeableRow.tsx`'s own A11Y-004 finding
  already flagged.** `SetRow`'s outer `View` (the `Row` holding the set-number
  `PressScale`, the two `NumberField`s, and the completion `Checkbox`) is the
  single child `SwipeableRow` clones its `accessible={true}` plus
  `leftAction`/`rightAction` `accessibilityActions` onto - confirmed via a
  real RNTL mount (accessibility report A11Y-P8-001,
  `reports/accessibility-2026-08-11-p8.md`) that every one of those controls
  is a descendant of that one already-`accessible` node, not a sibling of it.
  P8's fix for this same finding moved `PRBadge` (a non-interactive,
  `onPress`-free element with no reason to sit inside the swipeable region at
  all) out to render as a sibling below the `SwipeableRow`, mirroring how
  P7's `RestTimerBar` fix pulled its two adjust buttons out from under an
  equivalent collapse - but that fix deliberately did not touch `SetRow`'s
  actual interactive controls. Restructuring those - which control, if any,
  becomes the swipe-attachable primary target, and how the row keeps its "two
  taps, no keyboard" completion flow (NFR-01) working with several
  independently-operable controls instead of one - is a real design decision,
  not a prop tweak, and (per the entry above this one) RN Testing Library's
  prop-tree inspection cannot confirm or rule out how the native accessibility
  engine actually collapses this subtree on a real device. Do not attempt that
  restructuring without on-device VoiceOver/TalkBack verification first, for
  the same "don't trade a confirmed-safe layout for an unverified one" reason
  already given above. Source: accessibility audit finding A11Y-P8-001,
  `reports/accessibility-2026-08-11-p8.md`.

- **`ActiveWorkoutScreen`'s `FlashList` `extraData={{ focusedSetId, latestPR }}`
  prop (P8) is not currently the thing keeping `SessionExerciseCard`/`SetRow`
  repaints correct.** `renderItem` (`features/workout-logging/screens/
ActiveWorkoutScreen.tsx`) is an inline arrow function defined inside the
  component body, so a new function reference is created on every
  `ActiveWorkoutScreen` render - `FlashList`'s (like `FlatList`'s) cell-level
  `React.memo` comparison already fails, and every cell already repaints, on
  every parent render for that reason alone, independent of whether
  `extraData` changed. `extraData` was added for a real reason -
  `focusedSetId`/`latestPR` are read from render-time closures, not `data`
  itself - and stays correct, load-bearing practice going forward: the moment
  `renderItem` is hoisted to a stable, memoized reference (a legitimate
  future perf pass), `extraData` becomes the only thing keeping cell repaints
  synchronized with those two values, and removing it now would plant a bug
  for that future change to trip over. Found by test-agent's P8 coverage
  pass, not fixed - no user-visible symptom today, and the fix (hoisting
  `renderItem`, threading per-cell dependencies through some other means) is
  a real optimization pass of its own, not a one-line change. Source:
  `plans/2026-08-11-p8-progressive-overload-state.md`'s "Known follow-ups."

- **`expo-asset` is not hoisted, which breaks Jest module resolution for
  `@expo/vector-icons` inside a rendered RNTL test.** It's present in
  `package-lock.json`/`node_modules` but nested under
  `node_modules/expo/node_modules/expo-asset` rather than hoisted to the top level.
  This is a pre-existing latent gap - nothing before P4 ever rendered a
  `@expo/vector-icons` component inside a Jest test - not something P4 introduced.
  Confirmed Jest-resolver-only via a successful `npx expo export --platform ios`
  bundle: production/runtime is unaffected. Worked around in P4's own new tests with
  a manual mock module, `__tests__/__mocks__/vectorIconsMock.tsx`; not fixed at the
  dependency level.

- **Deleting an exercise's last remaining set during a historical edit
  (`WorkoutHistoryDetailScreen`'s edit mode) leaves that exercise as an empty
  card instead of auto-removing it.** `deleteSet` correctly soft-deletes the
  set and `syncCompletedSessionAfterEdit` correctly re-derives totals/PRs, but
  nothing calls `removeExercise` for the now-empty `session_exercise` - the
  card just renders with zero sets underneath it. Found by test-agent's P9
  coverage pass, which added a test documenting this exact behavior rather
  than a fix. Not fixed within the phase because a true fix is real, new
  mechanism work, not a call-site change: the existing per-set undo toast
  (`deleteSet` -> `restoreSet`) would need to become a combined undo that
  restores both the set and the auto-removed exercise together, since
  restoring only the set into an already-removed exercise card would be a
  worse, confusing half-state. Asked directly, the user chose to document
  this as a known gap and defer the fix to a future pass rather than risk a
  subtly wrong undo interaction shipped under phase-completion time pressure.
  Source: `plans/2026-08-13-p9-workout-summary-history-state.md`'s
  gap-fill entry, `reports/security-2026-08-13-p9.md`/
  `reports/accessibility-2026-08-13-p9.md` do not cover this (it is a
  correctness/UX gap, not a security or accessibility one).

- **A dev-only console warning - "Can't perform a React state update on a
  component that hasn't mounted yet" - surfaced twice during the post-P12
  bugfix pass's own navigation-heavy manual sweep.** The component stack
  named in the warning is rooted at `ContextNavigator`/`ExpoRoot`/`App` -
  framework-level, not a leaf screen - so it is not attributable to one
  specific screen without deeper investigation than this pass's own scope
  covered. Never blocked functionality, self-clears or is dismissible, and
  per React's own warning text will not appear at all in a production build.
  Not fixed this pass; a candidate for a future static sweep of
  setState-in-async-callback-without-a-mounted-check across the app root/
  navigation layer, rather than a targeted one-line fix, since the actual
  call site was never isolated. Source: this bugfix pass's own
  investigation, `plans/2026-08-19-postp12-bugfixes-state.md`.

- **`ActiveWorkoutBanner` did not appear on Profile's nested "Training
  calendar"/"Training history" screens while a workout was minimized,
  despite appearing correctly on Plans' nested screens
  (`PlanDetailScreen`).** Found during the post-P12 bugfix pass's full A-to-Z
  sweep. Not confirmed as a real bug versus an intentional difference in how
  Profile's stack is composed relative to Plans' - not investigated further
  this pass, since `ActiveWorkoutBanner` stays reachable via Home and every
  other tab regardless, making this low severity rather than a blocking
  finding. Source: this bugfix pass's own investigation,
  `plans/2026-08-19-postp12-bugfixes-state.md`.

**Resolved**: the icon library gap tracked here through P0-P2 is closed as of P3 -
`@expo/vector-icons` (Ionicons) is the app's icon system, first used in the
`app/(tabs)/_layout.tsx` tab bar (see "Stack" above). `components/ui`'s existing
`ReactNode`-typed icon props (e.g. `Checkbox`'s checkmark, `DraggableList`'s grip
dots) still use `Text`-glyph placeholders and should move to Ionicons the next time
each is touched, rather than in a dedicated sweep.

## Further reading

- `docs/ARCHITECTURE.md` - full architecture document (this file's source)
- `docs/ROADMAP.md` - the 17-phase build plan (P0-P16)
- `docs/adr/` - individual architecture decision records
- `docs/architecture-snapshot.md` - condensed synthesis for orchestration/agent use
