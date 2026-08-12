---
snapshot_commit: 4e59f18b037b74e226b41b3174d7d693bdf72aaa
generated_from: CLAUDE.md, docs/ARCHITECTURE.md, docs/ROADMAP.md, docs/adr/*, docs/PRODUCT-BRIEF.md
---

# GymTracker - architecture snapshot

Condensed synthesis for orchestration use. Full detail lives in docs/ARCHITECTURE.md
(section numbers referenced below) and CLAUDE.md - re-read the source when a decision
needs verification, this file is a pointer, not a replacement.

Note on `snapshot_commit`: this points at the working-tree HEAD at the time this file
was regenerated - the tip `feat/p8-progressive-overload` was cut from, before this
branch's own P8 commits (including this file's own update) land. `main` has since
moved ahead of this same hash with its own P6-docs and npm-audit-remediation commits,
so this hash is a lower bound for what P8 built on, not `main`'s current tip -
re-snapshot after the commit(s) that include this file's P8 update actually land, if
the exact hash matters for a later diff. Same caveat this file already carried for
`feat/p5-workout-plans` and `feat/p6-workout-logging` before each of those branches'
own commits landed.

## Status

P0 (project foundation), P1 (design system/UI primitives), P2 (persistence
foundation), P3 (onboarding, profile and core settings), P4 (exercise library), P5
(workout plans), P6 (workout logging), and P8 (progressive overload and personal
records) are complete on this branch. **P7 (rest timer) is absent from this branch's
history, not an oversight**: `feat/p8-progressive-overload` was cut from `main`
before `feat/p7-rest-timer`'s PR merged, a deliberate decision so the two phases
review independently - `features/rest-timer` here is still the empty skeleton P7
would have filled, and `RestTimerBar`'s slot in `ActiveWorkoutScreen` is still
omitted entirely. Merging this branch and P7's branch is expected to conflict in the
files both touch (`WorkoutSessionRepository.ts`/`SqliteWorkoutSessionRepository.ts`,
`WorkoutSessionService.ts`, `services/container.ts`, `ActiveWorkoutScreen.tsx`) -
expected and normal; whoever merges second resolves it. `onboarding`, `profile`,
`exercise-library`, `plans`, `workout-logging`, and `records` are the six features
with real implementations; the remaining five (`rest-timer`, `statistics`,
`body-metrics`, `calendar`, `data-transfer`) remain empty skeletons awaiting their
phase. The app boots for real as of P3, and as of P4 also seeds the exercise catalog
on every boot: `app/_layout.tsx` opens the database, runs migrations, runs
`database/seed/runSeed()` (idempotent), builds the `AppContainer`, holds the splash
screen until the profile query resolves, then gates to `/onboarding` or a 5-tab
layout (Home, Plans, Exercises, Stats, Profile) - and, as of P6, also checks the MMKV
`session.active` flag once a profile exists, redirecting straight into
`workout/active` for a fresh in-progress session or showing a finish-or-discard
dialog for a stale one (ADR-0005). Stats is the only tab still rendering a real "not
built yet" empty state; Exercises (P4) and Plans (P5) are both real nested Stack
navigators (list -> detail -> create/edit, and list -> detail -> day editor,
respectively); `workout-logging` (P6) is not a tab at all but a root-level
`fullScreenModal` route (`app/workout/active.tsx`) outside `(tabs)`, per ADR-0007.

Exercise library (P4): instant, diacritic-folded FTS5 search ("lezac" matches
"leżąc"), a multi-select filter sheet (muscle/equipment/body part/level/gym-home
context/favorites, OR within a category, AND across categories), favorites-first
ordering, FlashList results (its first real usage - declared since P0, unused until
now); detail screen with image gallery, instructions, tags, `formatExerciseName()`
Polish rendering (FR-04), an empty videos section (0% catalog video coverage), a
personal note, a per-exercise rest override, and (as of P8) two live performance
slots - previously three genuinely-empty sections pending that phase. Favorite
toggle with haptics; custom exercise create/edit (React Hook Form + Zod); delete
guarded by `listReferencingPlans`. Two P2 gaps were fixed as part of this phase:
catalog seeding was built but never wired up until now, and `loadCatalogAsset.ts`
now correctly maps the catalog's `primaryMuscles`/`secondaryMuscles` fields into
`catalogSeeder.ts`'s expected shape (previously every seeded exercise had zero
muscles). Verification: typecheck/lint/Jest (473 tests) clean, `npx expo export
--platform ios` used as a build-verification proxy (no simulator/emulator
available), security review clean (`reports/security-2026-08-06-p4.md`),
accessibility pass completed. Known follow-up: `expo-asset` is un-hoisted, breaking
Jest resolution for `@expo/vector-icons` inside RNTL-rendered tests (worked around
with a manual mock; confirmed production/runtime is unaffected via the `expo export`
bundle) - pre-existing gap, not a P4 regression.

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
but no in-workout UI calls it, until P8 wired PR evaluation onto the same
`completeSet` path); drop sets chain via `parent_set_id`. Deferred at the time: rest
timer (P7, `RestTimerBar` omitted, not stubbed - still true on this branch, see
"Status" above), PR evaluation (P8, resolved below), and the summary screen (P9 -
`finish()` navigates to Home instead, still true). `stores/activeWorkoutStore.ts` is
ADR-0008's one named exception to "Zustand is ephemeral only," mirroring the
persisted session under five governing rules (hydrate on mount only, pair every edit
with a dispatched write, reconcile from the database on failure, clear on
finish/discard, consume only via selectors) - P8 added a sixth field, `latestPR`, to
the same store under the same rules. Verification: typecheck/lint/Jest (86 suites,
782 tests, 1 pre-existing skip) clean, `expo export --platform ios` used again as the
build-verification proxy, security review clean bar two low, non-blocking notes
(`reports/security-2026-08-07-p6.md`). No new npm dependency.

Progressive overload and personal records (P8): `CompletedSetResult.newPRs`, typed
`readonly never[]` and always `[]` since P6, is real as of this phase.
`features/records/domain/{Estimated1RM,ProgressionAdvisor,evaluateCandidateRecords}.ts`
implement ADR-0015's three decisions - Epley/Brzycki e1RM with documented guard rails
(reps===1 returns the weight itself; above 12 reps returns `null` rather than a
fabricated number; only `normal`/`failure` sets are eligible), double-progression
suggestions, and per-record-type PR comparison.
`features/records/repository/{PersonalRecordRepository,SqlitePersonalRecordRepository}.ts`
(`listCurrent`, `listRecent`, `evaluateAndUpsert`, `listHistory`, `rebuild`) is a new
feature repository that deliberately does not extend `BaseSqliteRepository`
(`personal_record` has no `deleted_at` column by ADR-0015 design).
`SqliteWorkoutSessionRepository.completeSet` calls `evaluateAndUpsert` inside its own
existing transaction (the allowed `workout-logging -> records` dependency direction) -
a throwing evaluation rolls back the whole `completeSet` call, verified by a real
integration test, not just by inspection.
`features/workout-logging/repository/{ExerciseHistoryRepository,SqliteExerciseHistoryRepository}.ts`
is a new read-only read model (previous/best performance, recent sessions) with no
accompanying service, the same "flat DTOs, nothing to validate" shape a later
`StatisticsRepository` is expected to have. UI: `PRBadge`/`ProgressionHint`
(presentational, records barrel), rendered from `SetRow`/`SessionExerciseCard`;
`ExerciseDetailScreen` gained two optional slot props filled by its host route rather
than a new cross-feature import, keeping `exercise-library` a dependency-free leaf; a
new "Personal records" screen and route (`/profile/records`) and a new "Progression"
settings screen (`oneRm.formula`, `progression.upperIncrementKg`/`lowerIncrementKg`);
Settings gained a "Recalculate records" row (`recordService.rebuild()`, confirm
dialog, undo-free). A real `barrel -> hook -> container -> barrel` import cycle
surfaced while wiring presentation hooks and was fixed by having the new hooks take
their service/repository as a parameter rather than calling `useContainer()`
internally - the same pattern `useStartWorkout(sessionService)` already established.
`services/container.ts` gained `recordRepository`/`recordService`/
`exerciseHistoryRepository`. Verification: typecheck/lint/Jest (96 suites, 914 tests
passing, 1 pre-existing skip) clean, `expo export --platform ios` used again as the
build-verification proxy, no new npm dependency. Security review
(`reports/security-2026-08-11-p8.md`) found zero critical/high/medium findings, one
low (a `ConfirmDialog` double-tap gap shared by every confirm-then-mutate flow in the
codebase, not P8-specific, non-corrupting given `rebuild()`'s idempotency and
`ux_pr_current`), one informational. Accessibility review
(`reports/accessibility-2026-08-11-p8.md`) caught one BLOCKING finding - `PRBadge`
rendering inside `SetRow`'s pre-existing `SwipeableRow`-collapsed accessible node,
confirmed via an RNTL prop-tree dump - fixed within the phase by rendering `PRBadge`
as an independent sibling instead, with a real regression test added and verified via
revert-and-confirm; three further non-blocking findings (missing loading/empty
announcements on the new records screen, a missing `busy` accessibility state on the
"Recalculate records" row - `components/ui/ListRow.tsx` gained a reusable `busy`
prop for this, mirroring `Button.tsx`'s existing `loading` prop - and a missing
`accessible` pairing on `PRBadge`'s role) were fixed in the same pass. One
correctness nuance flagged, not fixed: `ActiveWorkoutScreen`'s new `FlashList`
`extraData` prop is real and correctly added, but is not currently the thing keeping
`SessionExerciseCard` repaints correct, since its `renderItem` is an inline function
recreated every render (which already forces every cell to repaint on its own) - see
CLAUDE.md's "Known gaps" for the full framing.

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
duplicates values). No new dependency through P8 on this branch.

## Architecture (section 3)

Clean Architecture, feature-sliced. Layers, dependencies point inward only:
Presentation -> Application -> Domain <- Infrastructure (Infrastructure implements
ports the domain/feature declares). Four rules mechanically enforced by ESLint
(`eslint.config.js`), not just convention: domain purity (no React/RN/Expo imports in
`domain/**`), the SQLite boundary (`expo-sqlite` only from `database/` or a feature's
`repository/*.ts`), no direct repository access from presentation (go through a
feature service via a hook), and cross-feature imports only through a feature's
`index.ts` barrel. Import cycles are banned project-wide (`import/no-cycle`) - P8's
own hooks (`useRecords`, `useExerciseHistory`) had to route their
service/repository as a call-site parameter rather than an internal
`useContainer()` call specifically to keep this rule satisfied, a live example of
the rule doing its job, not just theory.

CQRS-lite: statistics/history go through dedicated read-model repositories returning
flat SQL-aggregated DTOs, never load-all-then-sum-in-JS - P8's
`ExerciseHistoryRepository` is the first such read model actually built. Aggregate
boundary: a workout session + its exercises + its sets is one repository, one
transaction (crash safety + future sync conflict unit); P8 extends that transaction
to also cover personal-record evaluation rather than treating it as a second,
independent write.

## Folder structure (section 9)

Top level: `app/` (routing only, thin wrappers into `features/*/screens` - now
includes `app/(tabs)/` for the 5-tab layout (`app/(tabs)/exercises/` is a nested
Stack as of P4: list -> detail -> create/edit), `app/onboarding/`, `app/profile/`
(settings plus, as of P8, `records.tsx`), and `app/(modals)/`), `assets/` (fonts,
images, bundled exercise WebP images, `exercises.catalog.json`/`exercises.pl.json`/
`exercises.videos.json`, plus `exercises/imageMap.ts` and `exercises/index.ts` added
in P4 for filename -> `require()` resolution), `components/` (cross-feature, zero
domain knowledge - `ui/`, `layout/`, `feedback/`, `charts/`, `gestures/`),
`database/` (`client.ts`, `DatabaseProvider.tsx`, `migrations/`, `schema.sql`,
`seed/` - `runSeed()` now called from `app/_layout.tsx`'s boot sequence as of P4,
`sql/`), `domain/` (shared cross-feature value objects - `Weight.ts`, `Length.ts`,
deviation from the original section 9 tree, not yet synced back into
ARCHITECTURE.md), `features/` (one dir per feature: `onboarding`, `profile`,
`exercise-library`, `plans`, `workout-logging`, `rest-timer`, `records`,
`statistics`, `body-metrics`, `calendar`, `data-transfer` - each with
components/hooks/screens/services/domain/repository/types/index.ts; `onboarding` and
`profile` populated as of P3, `exercise-library` as of P4, `plans` as of P5,
`workout-logging` as of P6, `records` as of P8 - `rest-timer` stays an empty
skeleton on this branch specifically because P7 hasn't merged into it, not because
the phase hasn't happened at all; `statistics`/`body-metrics`/`calendar`/
`data-transfer` are still empty everywhere), `hooks/`, `navigation/` (`routes.ts` -
typed route helpers per section 10.2, added P3, gained `profile.records()` in P8),
`repositories/` (shared infra: `contracts/`, `base/`, `mapping/`, `query/`, plus the
cross-cutting `settings/` sibling), `services/` (`container.ts` composition root,
`files/`, `notifications/`, `haptics/`, `kv/`, `clock/`, `id/`, `logging/`),
`stores/` (Zustand, ephemeral UI state only - plus the one named `activeWorkoutStore`
exception), `theme/`, `types/`, `utils/`, `__tests__/`, `.maestro/`.

Two load-bearing rules: `app/` never contains screen bodies, only wrappers;
`components/` may never import from `features/`.

Module dependency graph (9.1): exercise-library is a leaf (no deps on plans/sessions/
records). plans depends on exercise-library only. workout-logging is the hub
(depends on exercise-library, plans, rest-timer, records); nothing depends on
workout-logging except read-side features (statistics, calendar, home,
data-transfer). rest-timer and records do not depend on workout-logging (they're
called by it - inverting this creates a cycle); P8 exercises this for real for the
first time, with `completeSet` calling into `recordRepository`, never the reverse.
statistics depends only on read models. data-transfer depends on everything and is
built last.

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
impossible at the DB level; a second, `ux_pr_current`, makes two simultaneous
"current" personal records for the same exercise/record-type/rep-bucket impossible
the same way - unchanged P2 schema, exercised for real by P8's write path but not
altered by it. Rest timer deadline is stored as an absolute timestamp in the DB, not
a JS interval - survives process death/Doze (not yet wired to a UI on this branch,
see "Status").

Settings: `app_setting` key/value table plus a `SETTINGS_SCHEMA` Zod registry
(`repositories/settings/settingsSchema.ts`) - 14 keys shipped in P2, `haptics.enabled`
added in P3 (mirrored into MMKV for synchronous reads inside gesture/press handlers,
per ADR-0008), `oneRm.formula`/`progression.upperIncrementKg`/
`progression.lowerIncrementKg` added in P8 (Zod-validated on both read and write,
default-fallback on a corrupt stored value - `progression.lowerIncrementKg`'s default
was found during P8 pass 1 to contradict ADR-0015's own spec, 1.25 vs. 5, and
corrected in pass 2). `user_profile` (nickname, optional avatar, birth date, sex)
shipped its table in P2 and got its first repository (`SqliteProfileRepository`) and
service (`ProfileService`) in P3 - no migration needed, the table already existed.
`ProfileService` writes an avatar file to disk before committing the DB row that
references it, per ADR-0012's write-then-commit ordering (defined there for progress
photos, reused here for avatars) - avoids a dangling-path bug from persisting an
absolute picker URI across app container UUID changes.

Set types: 6 values (Warm-up, Normal, Drop Set, Failure, Assisted, Partial) -
**not** 7. Superset is modeled as a relation between exercises (`superset_group`),
not a set-type value (approved deviation from the original brief, ADR-0006). Drop
sets chain via `parent_set_id`. A normative semantics table governs what counts
toward volume/PR/set-count; a test keeps the SQL view and the TS calculator from
drifting apart - P8's `evaluateCandidateRecords` reads the same table rather than
re-deriving PR eligibility on its own. Assisted sets are excluded from volume/PR
calculation in v1 (decision D-02).

Repository tests run in Node against real `schema.sql` via `NodeSqlExecutor`
(`node:sqlite`, chosen over `better-sqlite3` to skip a native compile step - CI pins
Node 24 for `node:sqlite` support), not mocks - `SqlitePersonalRecordRepository`/
`SqliteExerciseHistoryRepository` (P8) follow the same discipline.

Sync-readiness: only what pays for itself today (UUIDs for idempotent import,
`updated_at` for merge, soft delete for undo, aggregate transactions, a `rebuild()`
for derived data, an optional `tx` param on repository methods). No `change_log`
table, no `findChangedSince()`, no dead scaffolding for a sync layer that doesn't
exist yet (ADR-0004). `PersonalRecordRepository.rebuild()` is P8's own instance of
this "rebuild derived data from source of truth" primitive.

## Composition root (services/container.ts)

`AppContainer`/`createContainer`/`ContainerProvider`/`useContainer`. Deliberately
smaller than ARCHITECTURE.md section 8.4's full shape - `profileRepository`/
`profileService` (P3), `exerciseRepository`/`exerciseService` (P4),
`planRepository`/`planService` (P5), `sessionRepository`/`sessionService` (P6), and
`recordRepository`/`recordService`/`exerciseHistoryRepository` (P8, the last one
read-only with no matching service) are the feature repository pairs to land on this
branch; the rest land one at a time as each phase merges, each extending
`AppContainer` rather than replacing it - `rest-timer`'s own pair does not exist here
yet since P7 hasn't merged into this branch (see "Status"). `SqliteExerciseRepository`
is the first real consumer of `BaseSqliteRepository` beyond `SqliteProfileRepository`,
and maintains the `exercise_fts` FTS5 index incrementally per single-row write
(contentless-table `'delete'` special command plus a fresh insert - `DELETE FROM ...
WHERE rowid = ?` throws on a contentless table). `SqlitePlanRepository` (P5) is the
first aggregate-root repository - a plan plus its days plus its day-exercises commits
as one transaction, joining a caller-supplied `tx` when given;
`SqliteWorkoutSessionRepository` (P6) is the second, same pattern, one session plus
its exercises, sets and active-session-state row per transaction, and (as of P8)
`recordRepository`'s PR evaluation joins that same transaction too rather than
opening its own. `SqlitePersonalRecordRepository`/`SqliteExerciseHistoryRepository`
(P8) deliberately don't extend `BaseSqliteRepository` - `personal_record` has no
`deleted_at` column by ADR-0015 design, and the history repository is read-only - but
both still route every value through parameterized queries, so none of that base
class's injection-safety guarantee is lost by opting out of it. `services/kv` is
intentionally not a container member (ADR-0008: MMKV holds boot-critical flags read
before the database opens).

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

ADR-0015 (P8, new this phase): Epley e1RM by default with Brzycki selectable, double
progression for suggested next weight/reps (not linear, not RPE-autoregulated -
rejected because `target_rep_min`/`target_rep_max` already exist on
`plan_day_exercise` and RPE is optional so an RPE-based suggester degrades silently
too often), and personal records as a `rebuild()`-able cache rather than a derived
view, so a full recompute is always one call away if the evaluation logic ever
changes.

## Icon system (resolved P3)

No icon library existed through P0-P2 (every icon prop in `components/ui` was typed
`ReactNode` with `Text`-glyph placeholders). P3 resolved this: `@expo/vector-icons`
(Ionicons) is the app's icon system, first used in the tab bar. Existing placeholder
glyphs in `components/ui` migrate to Ionicons opportunistically, not in a dedicated
sweep - don't let a second icon system start alongside it. P8's new `PRBadge` uses a
`trophy` Ionicon; `ProgressionHint` uses `trending-up-outline`.

## Roadmap (docs/ROADMAP.md)

17 phases (P0-P16), one Conventional Commit per phase, feature-by-feature - never
move to the next phase until the current one is complete and committed. P0 project
foundation, P1 design system/UI primitives, P2 persistence foundation, P3 onboarding/
profile/core settings, P4 exercise library, P5 workout plans, P6 workout logging (the
core 2-3-second-set screen), P7 rest timer, P8 progressive overload and personal
records, P9 workout summary and history, P10 home screen, P11 statistics and charts,
P12 calendar, P13 body measurements and progress photos, P14 data export/import, P15
performance hardening and polish, P16 release engineering. This branch implements P8
without P7 underneath it (see "Status") - a deliberate, flagged exception to the
"never skip ahead" rule's usual reading, not a violation of it: P8 doesn't depend on
P7's output, only on P6's, so the two were sequenced for independent review rather
than strictly in roadmap order.

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
have real round-trip property tests as of P3, and P8's e1RM/progression/PR-evaluation
calculators follow the same discipline, including a property-based rebuild
equivalence test verified non-tautological by deliberately breaking the SQL view's
`ORDER BY` and confirming the test actually failed first. Repository layer:
integration tests against real `schema.sql` via `NodeSqlExecutor` (`node:sqlite`),
not mocks. Component layer: React Native Testing Library for interaction-critical
components (set row, quick-adjust chips, and - as of P8 - the PR badge's
accessibility-subtree placement, added as a real RNTL regression test verified with
revert-and-confirm discipline). E2E: Maestro flows for the golden path (start
workout -> log a set -> finish). `__tests__/database/benchmarks.perf.test.ts` is a
CI performance-regression suite (ADR-0014); the exercise-search benchmark (~900-row
fixture, sub-50ms, NFR-03), previously `test.skip`'d, is implemented and passing as
of P4. One benchmark still stays `test.skip`'d with a comment naming its future phase
(JSON export - P9 per the test file's own comment - note this P9 label predates and
conflicts with this snapshot's P9 "workout summary and history" / P14 "data export
and import" naming from `docs/ROADMAP.md`; flagged as unresolved drift, not fixed
here), not silently omitted. Testing this phase also surfaced a Jest-only gap:
`@expo/vector-icons` fails to resolve inside RNTL-rendered tests because
`expo-asset` isn't hoisted (worked around with a manual mock,
`__tests__/__mocks__/vectorIconsMock.tsx`; confirmed production-unaffected via
`expo export`). Full suite as of P8: 96 suites, 914 tests passing, 1 pre-existing
skip.

## What this snapshot deliberately omits

Full DDL (section 7), the complete theme token values (section 11), the full
navigation route table (section 10), and the per-phase acceptance criteria in
ROADMAP.md are not duplicated here - read the source when a phase actually needs
them, since copying them risks drift between this snapshot and the source of truth.
