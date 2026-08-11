# CLAUDE.md

Read this before touching this repo. Full depth lives in `docs/ARCHITECTURE.md`,
`docs/ROADMAP.md`, and `docs/adr/*` - this file is a distilled, machine-readable
reference, not a replacement. Section numbers below refer to `docs/ARCHITECTURE.md`.

## Status

P0 (project foundation), P1 (design system and UI primitives), P2 (persistence
foundation), P3 (onboarding, profile and core settings), P4 (exercise library), P5
(workout plans), and P6 (workout logging) are complete. The `onboarding`, `profile`,
`exercise-library`, `plans`, and `workout-logging` features now have real
implementations (screens, hooks, services, repository); the remaining six features
(`rest-timer`, `records`, `statistics`, `body-metrics`, `calendar`, `data-transfer`)
are still empty skeleton directories (components/hooks/screens/services/domain/
repository/types/index.ts subfolders, no implementation) awaiting their own phase.

The app now boots for real: `app/_layout.tsx` opens the database, runs migrations,
seeds the exercise catalog (`database/seed/runSeed()`, idempotent - a P2 gap fixed in
P4, see below), builds the `AppContainer`, holds the splash screen until the profile
query resolves, then gates to `/onboarding` (no profile yet) or the tab bar.
`app/index.tsx` no longer exists - the Home screen moved to `app/(tabs)/index.tsx`
under a 5-tab layout (`app/(tabs)/_layout.tsx`: Home, Plans, Exercises, Stats,
Profile) using `@expo/vector-icons` (Ionicons; see "Known gaps" history below - this
resolved the prior no-icon-library gap). The Stats tab is the only one still
rendering a genuine "not built yet" empty state (its feature lands in P11), not a
stub - Plans joined Exercises as a real nested Stack navigator in P5 (see below).
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
  override, and three performance sections that are genuinely empty (not stubs) pending
  P8. Favorite toggle fires haptics; custom exercise create/edit uses React Hook Form +
  Zod with primary/secondary muscle selection; delete is guarded by
  `listReferencingPlans`, which names the blocking plan rather than failing silently.

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

Deliberately deferred, and why: the rest timer (P7) - `RestTimerBar`'s slot is omitted
from `ActiveWorkoutScreen` entirely rather than a structurally-present-but-inert
placeholder, since nothing in P6 ever populates a timer deadline for it to react to.
Progression suggestions and PR evaluation (P8) - `CompletedSetResult.newPRs` is typed
`readonly never[]` and always `[]`; `PersonalRecordRepository` has a table and an index
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

Twelve features total: `onboarding`, `profile`, `exercise-library`, `plans`,
`workout-logging`, `rest-timer`, `records`, `statistics`, `body-metrics`,
`calendar`, `data-transfer`, `daily-goals`.

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
