---
snapshot_commit: 4e59f18b037b74e226b41b3174d7d693bdf72aaa
generated_from: CLAUDE.md, docs/ARCHITECTURE.md, docs/ROADMAP.md, docs/adr/*, docs/PRODUCT-BRIEF.md
---

# GymTracker - architecture snapshot

Condensed synthesis for orchestration use. Full detail lives in docs/ARCHITECTURE.md
(section numbers referenced below) and CLAUDE.md - re-read the source when a decision
needs verification, this file is a pointer, not a replacement.

Note on `snapshot_commit`: this points at the working-tree HEAD at the time this file
was regenerated (the tip of `feat/p7-rest-timer` before that branch's own P7 commits,
including this file's own update, land). It is therefore identical to the commit
`main` was already at before P7 started - re-snapshot after the commit(s) that include
this file's P7 update actually land, if the exact hash matters for a later diff. Same
caveat this file already carried for `feat/p6-workout-logging` before its commit
landed, and `feat/p5-workout-plans` before that.

## Status

P0 (project foundation), P1 (design system/UI primitives), P2 (persistence
foundation), P3 (onboarding, profile and core settings), P4 (exercise library), P5
(workout plans), P6 (workout logging), and P7 (rest timer) are complete and committed
or ready to commit. `onboarding`, `profile`, `exercise-library`, `plans`,
`workout-logging`, and `rest-timer` are the first six features with real
implementations (`rest-timer` owns no database table and therefore no repository -
see below); the other five (`records`, `statistics`, `body-metrics`, `calendar`,
`data-transfer`) remain empty skeletons awaiting their phase. The app boots for real
as of P3, and as of P4 also
seeds the exercise catalog on every boot: `app/_layout.tsx` opens the database, runs
migrations, runs `database/seed/runSeed()` (idempotent), builds the `AppContainer`,
holds the splash screen until the profile query resolves, then gates to
`/onboarding` or a 5-tab layout (Home, Plans, Exercises, Stats, Profile) - and, as of
P6, also checks the MMKV `session.active` flag once a profile exists, redirecting
straight into `workout/active` for a fresh in-progress session or showing a
finish-or-discard dialog for a stale one (ADR-0005). Stats is the only tab still
rendering a real "not built yet" empty state; Exercises (P4) and Plans (P5) are both
real nested Stack navigators (list -> detail -> create/edit, and list -> detail ->
day editor, respectively); `workout-logging` (P6) is not a tab at all but a
root-level `fullScreenModal` route (`app/workout/active.tsx`) outside `(tabs)`, per
ADR-0007.

Exercise library (P4): instant, diacritic-folded FTS5 search ("lezac" matches
"leżąc"), a multi-select filter sheet (muscle/equipment/body part/level/gym-home
context/favorites, OR within a category, AND across categories), favorites-first
ordering, FlashList results (its first real usage - declared since P0, unused until
now); detail screen with image gallery, instructions, tags, `formatExerciseName()`
Polish rendering (FR-04), an empty videos section (0% catalog video coverage), a
personal note, a per-exercise rest override, and three performance sections that are
genuinely empty pending P8, not stubs; favorite toggle with haptics; custom
exercise create/edit (React Hook Form + Zod); delete guarded by
`listReferencingPlans`. Two P2 gaps were fixed as part of this phase: catalog seeding
was built but never wired up until now, and `loadCatalogAsset.ts` now correctly maps
the catalog's `primaryMuscles`/`secondaryMuscles` fields into `catalogSeeder.ts`'s
expected shape (previously every seeded exercise had zero muscles). Verification:
typecheck/lint/Jest (473 tests) clean, `npx expo export --platform ios` used as a
build-verification proxy (no simulator/emulator available), security review clean
(`reports/security-2026-08-06-p4.md`), accessibility pass completed. Known follow-up:
`expo-asset` is un-hoisted, breaking Jest resolution for `@expo/vector-icons` inside
RNTL-rendered tests (worked around with a manual mock; confirmed production/runtime
is unaffected via the `expo export` bundle) - pre-existing gap, not a P4 regression.

Workout plans (P5): `PlanRepository`/`SqlitePlanRepository` is the first
aggregate-root feature repository (plan + days + day-exercises, one transaction),
adding 5 methods beyond section 8.3's literal 17 - `deletePlan`/`restorePlan`/
`purgePlan` and `restoreDay`/`restoreDayExercise` - the same kind of addition P4's
`ExerciseRepository` made with `deleteCustom`. `PlanService` routes whole-plan delete
to the hard `purgePlan` (confirm dialog, no undo - fires `workout_session`'s
`ON DELETE SET NULL`/`CASCADE` for session-snapshot survival) and day/day-exercise
delete to soft-delete-plus-undo-toast instead, per the nav-rules tier split; both
`duplicatePlan` and `duplicateDay` disambiguate name collisions ("(copy)", "(copy
2)", ...) globally and per-plan respectively; `setSupersetGroup` needs >=2 ids to
form/update a group but allows exactly 1 to clear back to standalone. Presentation:
`PlanListScreen`/`PlanDetailScreen`/`PlanDayEditorScreen`, replacing the Plans tab's
P0-P4 "not built yet" stub with a nested Stack navigator mirroring P4's Exercises-tab
restructure. `app/(modals)/` is the app's first modal route group, holding the new
`ExercisePickerScreen` (a multi-select sibling of the P4 library screen); its result
- an unbounded exercise-id list - returns via a new root-level Zustand store
(`stores/exercisePickerStore.ts`) rather than route params, since Expo Router has no
push-and-await primitive and the result has no bounded size to serialize into a URL.
`components/gestures/DraggableList.tsx`'s tracked gesture-only-reorder gap was closed
this phase in two rounds (a first pass whose fix didn't reach a native accessibility
node through the real row components, caught by a follow-up review and corrected
with a regression test - full detail in CLAUDE.md's "Known gaps"). Verification:
typecheck/lint/Jest (70 suites, 616 tests, 1 pre-existing skip) clean, `expo export
--platform ios` used again as the build-verification proxy, security review clean
bar one low/informational note (`reports/security-2026-08-06-p5.md`), accessibility
review (`reports/accessibility-2026-08-06-p5.md`) blocked on the DraggableList
first-pass gap and cleared after the second-pass fix. No new npm dependency.

Workout logging (P6): `WorkoutSessionRepository`/`SqliteWorkoutSessionRepository` is
the app's second aggregate-root repository (session + exercises + sets + active
state, one committed transaction per mutation, ADR-0005), following the pattern P5's
`PlanRepository` established; `setExerciseNote`/`setSessionNotes` (FR-16) were added
during a review pass, before commit, after the first draft shipped with no write path
for either note. `ActiveWorkoutScreen` (`app/workout/active.tsx`) is a root-level
`fullScreenModal` outside `(tabs)` (ADR-0007) with gestures disabled and Android back
intercepted into a minimize/finish/discard sheet; minimizing docks a persistent
`ActiveWorkoutBanner` above the tab bar. Crash recovery (FR-19) is a boot-gate
extension in `app/_layout.tsx`: an MMKV `session.active` flag checked once a profile
exists, redirecting into a fresh in-progress session or prompting finish-or-discard on
a stale one - the mechanism only, not the polished Home "Resume" card, which stays P10
scope. Set types are ADR-0006's 6-value enum; supersets carry over from the plan day
as a read-only relation this phase (the repository/service fully support editing one,
but no in-workout UI calls it); drop sets chain via `parent_set_id`. Deferred:
rest timer (P7, `RestTimerBar` omitted, not stubbed), PR evaluation (P8,
`CompletedSetResult.newPRs` always `[]`), and the summary screen (P9 - `finish()`
navigates to Home instead). `stores/activeWorkoutStore.ts` is ADR-0008's one named
exception to "Zustand is ephemeral only," mirroring the persisted session under five
governing rules (hydrate on mount only, pair every edit with a dispatched write,
reconcile from the database on failure, clear on finish/discard, consume only via
selectors). Verification: typecheck/lint/Jest (86 suites, 782 tests, 1 pre-existing
skip) clean, `expo export --platform ios` used again as the build-verification proxy,
security review clean bar two low, non-blocking notes
(`reports/security-2026-08-07-p6.md`). No new npm dependency.

Rest timer (P7): `RestTimerBar`'s slot, omitted from `ActiveWorkoutScreen` since P6,
is populated. `resolveRestSeconds`/`supersetRestRule` (`features/rest-timer/domain/`)
are pure calculators - the three-tier rest-duration precedence (exercise override,
plan day, global default) and D-03/ADR-0006's superset skip rule - both fast-check
property tested. `RestTimerNotificationService` schedules `expo-notifications` against
an absolute deadline (never a relative delay/JS timer, R-04), requests permission
lazily on first real use, and never throws. `stores/restTimerStore.ts` is the app's
second Zustand store holding real timer state (`deadlineAt`/`totalSeconds`/`now`,
recomputed on every `tick()`, never decremented - "recompute, never accumulate").
`SqliteWorkoutSessionRepository.startFromPlanDay`/`addExercise` were fixed to seed
`rest_seconds_override` through `resolveRestSeconds` instead of a bare/null plan-day
value - a pre-existing gap found while scoping this phase, not a P7 regression; a new
`setExerciseRestOverride` method (mirroring `setExerciseNote`) supports tap-to-adjust
persisting to the session; `ActiveStatePatch` gained the `timerDeadlineAt`/
`timerTotalSeconds`/`timerNotificationId` fields P6 had not actually added despite the
plan's brief assuming otherwise. The notification's deep link
(`gymtracker://workout/active`) is wired end-to-end in `app/_layout.tsx` (warm
listener + cold-start read). `services/haptics/timerFinished()` got its first real
caller; `hooks/useAppState.ts` is the first occupant of the reserved root `hooks/`
folder. `services/container.ts` has zero diff this phase - `rest-timer` owns no table
and stays a dependency-free leaf per section 9.1, called by `workout-logging` rather
than depending on it. Verification: typecheck/lint/Jest (92 suites, 851 tests, 1
pre-existing skip) clean, `expo export --platform ios` used again as the
build-verification proxy, security review clean bar one informational note carried
forward from P6 (`reports/security-2026-08-11-p7.md`). Accessibility review
(`reports/accessibility-2026-08-11-p7.md`, run by a general-purpose agent standing in
for the unregistered accessibility-agent role) caught one blocking finding -
`RestTimerBar` collapsed its decrease/countdown/increase controls into one inert
accessibility node via a `SwipeableRow` misuse - fixed within the phase (`SwipeableRow`
now wraps only the countdown control) and covered by a new RNTL regression test. A
separate code-review pass fixed two correctness bugs before commit: finish/discard no
longer leaves a running timer and its OS notification behind, and a `saveActiveState`
write-ordering race (guarded by a new monotonic operation-sequence check) no longer
lets a stale, already-cancelled timer overwrite a newer one. Deliberately out of
scope: `timer.sound` is a working, persisted setting with no audio-playback backend
wired to it (no sound-library dependency exists in this project). No new npm
dependency.

## Product

Offline-only React Native/Expo workout logging app. No backend, no accounts, no cloud.
Core promise: log a set in 2-3 seconds. Dark mode only. Working name GymTracker,
bundle id `com.konradmalinowski.gymtracker`. Min OS: iOS 15+, Android 8 / API 26+.
Package manager: npm. GitHub: konradxmalinowski/gymtracker (public).

## Stack (fixed)

Expo (current SDK) + TypeScript strict + Expo Router (typed routes) + Zustand +
TanStack Query + Expo SQLite + React Hook Form (+ `@hookform/resolvers` for Zod
schema resolvers) + Zod + MMKV + FlashList (declared since P0, first real usage in
P4's exercise library results list) + Reanimated + Gesture Handler + Victory
Native XL (Skia-based, wrapped in components/charts adapter per ADR-0010) + React
Native SVG + `@expo/vector-icons` (Ionicons - the app's only icon system, chosen P3)
+ `expo-image-picker` (avatar/photo selection) + Expo Notifications + Expo Haptics +
Expo FileSystem + NativeWind (tailwind.config.js imports theme/tokens.ts, never
duplicates values).

## Architecture (section 3)

Clean Architecture, feature-sliced. Layers, dependencies point inward only:
Presentation -> Application -> Domain <- Infrastructure (Infrastructure implements
ports the domain/feature declares). Four rules mechanically enforced by ESLint
(`eslint.config.js`), not just convention: domain purity (no React/RN/Expo imports in
`domain/**`), the SQLite boundary (`expo-sqlite` only from `database/` or a feature's
`repository/*.ts`), no direct repository access from presentation (go through a
feature service via a hook), and cross-feature imports only through a feature's
`index.ts` barrel. Import cycles are banned project-wide (`import/no-cycle`).

CQRS-lite: statistics/history go through dedicated read-model repositories returning
flat SQL-aggregated DTOs, never load-all-then-sum-in-JS. Aggregate boundary: a workout
session + its exercises + its sets is one repository, one transaction (crash safety +
future sync conflict unit).

## Folder structure (section 9)

Top level: `app/` (routing only, thin wrappers into `features/*/screens` - now
includes `app/(tabs)/` for the 5-tab layout (`app/(tabs)/exercises/` is a nested
Stack as of P4: list -> detail -> create/edit), `app/onboarding/`, and
`app/profile/settings/`), `assets/` (fonts, images, bundled exercise WebP images,
`exercises.catalog.json`/`exercises.pl.json`/`exercises.videos.json`, plus
`exercises/imageMap.ts` and `exercises/index.ts` added in P4 for filename ->
`require()` resolution), `components/` (cross-feature, zero domain knowledge -
`ui/`, `layout/`, `feedback/`, `charts/`, `gestures/`), `database/` (`client.ts`,
`DatabaseProvider.tsx`, `migrations/`, `schema.sql`, `seed/` - `runSeed()` now called
from `app/_layout.tsx`'s boot sequence as of P4, `sql/`), `domain/` (shared
cross-feature value objects - `Weight.ts`, `Length.ts`, deviation from the original
section 9 tree, not yet synced back into ARCHITECTURE.md), `features/` (one dir per
feature: `onboarding`, `profile`, `exercise-library`, `plans`, `workout-logging`,
`rest-timer`, `records`, `statistics`, `body-metrics`, `calendar`, `data-transfer` -
each with components/hooks/screens/services/domain/repository/types/index.ts;
`onboarding` and `profile` are populated as of P3, `exercise-library` as of P4,
`plans` as of P5 (the app's first aggregate-root feature repository - see below),
`workout-logging` as of P6 (its second, see below), `rest-timer` as of P7 (a leaf with
no repository - see below), the rest are still empty), `hooks/` (its first occupant,
`useAppState.ts`, landed in P7), `navigation/` (`routes.ts` - typed route helpers per
section 10.2, added P3), `repositories/` (shared infra: `contracts/`, `base/`,
`mapping/`, `query/`, plus the cross-cutting `settings/` sibling), `services/`
(`container.ts` composition root, `files/`,
`notifications/`, `haptics/`, `kv/`, `clock/`, `id/`, `logging/`), `stores/` (Zustand,
ephemeral UI state only), `theme/`, `types/`, `utils/`, `__tests__/`, `.maestro/`.

Two load-bearing rules: `app/` never contains screen bodies, only wrappers;
`components/` may never import from `features/`.

Module dependency graph (9.1): exercise-library is a leaf (no deps on plans/sessions/
records). plans depends on exercise-library only. workout-logging is the hub
(depends on exercise-library, plans, rest-timer, records); nothing depends on
workout-logging except read-side features (statistics, calendar, home,
data-transfer). rest-timer and records do not depend on workout-logging (they're
called by it - inverting this creates a cycle). statistics depends only on read
models. data-transfer depends on everything and is built last.

## Data layer (sections 7-8)

SQLite via Expo SQLite. UUIDv7 TEXT primary keys everywhere (sync-readiness).
Timestamps: epoch ms UTC plus a separate `local_date` (YYYY-MM-DD) column on every
entity the user perceives as "a day" (streaks, calendar) - without it, timezone
travel breaks both. Weights always stored in kg, lengths in cm; unit conversion only
in `domain/Weight.ts`/`domain/Length.ts` (full ADR-0009 conversion/rounding/display
spec, fleshed out in P3 with `fast-check` round-trip property tests) - ESLint bans
unit-conversion constants anywhere else. Exercise catalog data is separated from user
data (`exercise` vs `exercise_user_data`) so a catalog update never destroys
favorites/notes. WAL + `synchronous=FULL`. In-progress workout has no separate
"draft" concept - it's a `workout_session` row with `status='in_progress'`, committed
after every set; a partial unique index makes two simultaneous active sessions
impossible at the DB level. Rest timer deadline is stored as an absolute timestamp in
the DB, not a JS interval - survives process death/Doze.

Settings: `app_setting` key/value table plus a `SETTINGS_SCHEMA` Zod registry
(`repositories/settings/settingsSchema.ts`) covering all 15 v1 keys (14 shipped in
P2, plus `haptics.enabled` added in P3 - a global haptics toggle mirrored into MMKV
for synchronous reads inside gesture/press handlers, per ADR-0008's mirroring
pattern; SQLite stays authoritative). `user_profile` (nickname, optional avatar,
birth date, sex) shipped its table in P2 and got its first repository
(`SqliteProfileRepository`) and service (`ProfileService`) in P3 - no migration
needed, the table already existed. `ProfileService` writes an avatar file to disk
before committing the DB row that references it, per ADR-0012's write-then-commit
ordering (defined there for progress photos, reused here for avatars) - avoids a
dangling-path bug from persisting an absolute picker URI across app container UUID
changes.

Set types: 6 values (Warm-up, Normal, Drop Set, Failure, Assisted, Partial) -
**not** 7. Superset is modeled as a relation between exercises (`superset_group`),
not a set-type value (approved deviation from the original brief, ADR-0006). Drop
sets chain via `parent_set_id`. A normative semantics table governs what counts
toward volume/PR/set-count; a test keeps the SQL view and the TS calculator from
drifting apart. Assisted sets are excluded from volume/PR calculation in v1
(decision D-02).

Repository tests run in Node against real `schema.sql` via `NodeSqlExecutor`
(`node:sqlite`, chosen over `better-sqlite3` to skip a native compile step - CI pins
Node 24 for `node:sqlite` support), not mocks.

Sync-readiness: only what pays for itself today (UUIDs for idempotent import,
`updated_at` for merge, soft delete for undo, aggregate transactions, a `rebuild()`
for derived data, an optional `tx` param on repository methods). No `change_log`
table, no `findChangedSince()`, no dead scaffolding for a sync layer that doesn't
exist yet (ADR-0004).

## Composition root (services/container.ts)

`AppContainer`/`createContainer`/`ContainerProvider`/`useContainer`. Deliberately
smaller than ARCHITECTURE.md section 8.4's full shape - `profileRepository`/
`profileService` (P3), `exerciseRepository`/`exerciseService` (P4),
`planRepository`/`planService` (P5), and `sessionRepository`/`sessionService` (P6)
are the first four feature repository pairs to land; P7 (rest-timer) added none - it
owns no database table and stays a dependency-free leaf, called by `workout-logging`
rather than needing its own container entry - so this stays a four-pair container
with the rest landing one at a time from P8 onward, each phase extending
`AppContainer` rather than replacing it.
`SqliteExerciseRepository` is the first real consumer of `BaseSqliteRepository`
beyond `SqliteProfileRepository`, and maintains the `exercise_fts` FTS5 index
incrementally per single-row write (contentless-table `'delete'` special command
plus a fresh insert - `DELETE FROM ... WHERE rowid = ?` throws on a contentless
table). `SqlitePlanRepository` (P5) is the first aggregate-root repository - a plan
plus its days plus its day-exercises commits as one transaction, joining a
caller-supplied `tx` when given; `SqliteWorkoutSessionRepository` (P6) is the
second, same pattern, one session plus its exercises, sets and active-session-state
row per transaction. `services/kv` is intentionally not a container member
(ADR-0008: MMKV holds boot-critical flags read before the database opens).

## Resolved product/technical decisions (section 18, D-01..D-12)

All originally-open questions are closed and accepted:
- D-11: English UI in v1, i18n wired from P1 (every string through `t()` from the
  start - not deferred, since retrofitting after 8 features is the exact refactor
  this avoids). Polish exists only as exercise-name translations, not full UI.
- D-01 (exercise images): full bundle of all ~1600 Free Exercise DB images,
  downscaled to 512px WebP (~30-55MB) - fully offline from first launch, no network-
  dependent gallery. Escalation path if size becomes a problem: tighten WebP
  quality, then one image per exercise instead of a gallery - lazy network loading
  is off the table.
- D-02: see above (assisted sets).
- D-03: superset rest timer starts only after the last exercise in the group.
- D-04: estimated calories shown in workout summary, labeled as an estimate,
  default-off toggle.
- D-05: Sentry crash reporting is opt-in, disabled by default, and wired in P0
  (config plugin + default-off toggle); the user-facing toggle and the only
  `Sentry.init()` call site land in P15 (settings), not before - no error
  boundaries or capture call sites until a feature exists to instrument.
- D-06: progress photos excluded from JSON export (base64 photos risk OOM on
  weaker Android devices).
- D-07: CSV import from Strong/Hevy deferred past v1.
- Remaining D-08..D-12 are backlog-tier, non-blocking; see section 18 for detail
  if a later phase needs them.

## Icon system (resolved P3)

No icon library existed through P0-P2 (every icon prop in `components/ui` was typed
`ReactNode` with `Text`-glyph placeholders). P3 resolved this: `@expo/vector-icons`
(Ionicons) is the app's icon system, first used in the tab bar. Existing placeholder
glyphs in `components/ui` migrate to Ionicons opportunistically, not in a dedicated
sweep - don't let a second icon system start alongside it.

## Roadmap (docs/ROADMAP.md)

17 phases (P0-P16), one Conventional Commit per phase, feature-by-feature - never
move to the next phase until the current one is complete and committed. P0 project
foundation, P1 design system/UI primitives, P2 persistence foundation, P3 onboarding/
profile/core settings, P4 exercise library, P5 workout plans, P6 workout logging (the
core 2-3-second-set screen), P7 rest timer, P8 progressive overload and personal
records, P9 workout summary and history, P10 home screen, P11 statistics and charts,
P12 calendar, P13 body measurements and progress photos, P14 data export/import, P15
performance hardening and polish, P16 release engineering.

Ordering is dependency-driven: exercise-library is a leaf and ships before plans/
workout-logging can consume it; rest-timer and records exist before workout-logging
because workout-logging is the hub that calls them; onboarding/profile ship early
(P3) because the root layout's boot gate (database open -> migrate -> profile check)
has to exist before any other screen can safely render.

## CI/CD and tooling (section 15, P0 scope)

ESLint flat config with the layering rules above, Prettier, Husky + lint-staged +
commitlint (Conventional Commits enforced by hook - `commit-msg` runs commitlint,
`pre-commit` runs lint-staged), Jest + jest-expo + React Native Testing Library +
fast-check, GitHub Actions running `tsc --noEmit` / `eslint` / `prettier --check` /
`jest --ci` / `expo-doctor` / `npm audit --audit-level=high` on every push and PR to
`main`, EAS project with development/preview/production build profiles. Sentry
(`@sentry/react-native`) config plugin wired unconditionally but crash reporting
defaults off, no DSN committed (D-05, see above).

## Testing strategy (section 14)

Domain layer: property-based tests (fast-check) for calculators (1RM, volume, PR
detection) - the highest-value tests in the app; `domain/Weight.ts`/`domain/Length.ts`
have real round-trip property tests as of P3. Repository layer: integration tests
against real `schema.sql` via `NodeSqlExecutor` (`node:sqlite`), not mocks. Component
layer: React Native Testing Library for interaction-critical components (set row,
quick-adjust chips). E2E: Maestro flows for the golden path (start workout -> log a
set -> finish). `__tests__/database/benchmarks.perf.test.ts` is a CI
performance-regression suite (ADR-0014); the exercise-search benchmark
(~900-row fixture, sub-50ms, NFR-03), previously `test.skip`'d, is implemented and
passing as of P4. One benchmark still stays `test.skip`'d with a comment naming its
future phase (JSON export - P9 per the test file's own comment - note this P9 label
predates and conflicts with this snapshot's P9 "workout summary and history" / P14
"data export and import" naming from `docs/ROADMAP.md`; flagged as unresolved drift,
not fixed here), not silently omitted. Testing this phase also surfaced a Jest-only
gap: `@expo/vector-icons` fails to resolve inside RNTL-rendered tests because
`expo-asset` isn't hoisted (worked around with a manual mock,
`__tests__/__mocks__/vectorIconsMock.tsx`; confirmed production-unaffected via
`expo export`).

## What this snapshot deliberately omits

Full DDL (section 7), the complete theme token values (section 11), the full
navigation route table (section 10), and the per-phase acceptance criteria in
ROADMAP.md are not duplicated here - read the source when a phase actually needs
them, since copying them risks drift between this snapshot and the source of truth.
