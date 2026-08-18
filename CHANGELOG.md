# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
once it starts tagging real releases.

**Convention**: this is a living file, not a one-time artifact. Every roadmap
phase (P0-P16, see `docs/ROADMAP.md`) adds its own dated entry under
`[Unreleased]` when that phase's commit lands. Entries accumulate under
`[Unreleased]` until the project is ready to ship - at that point the
accumulated entries move under a version heading and `package.json`'s version
stops being a scaffold placeholder.

## [Unreleased]

### Added

- Expo/TypeScript project scaffold with strict TypeScript config (`strict`,
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) (P0)
- Feature-sliced folder structure per `docs/ARCHITECTURE.md` section 9 (P0)
- ESLint architecture-layering rules enforcing domain purity, the SQLite
  boundary, no direct repository access from presentation, and cross-feature
  barrel-only imports (P0)
- NativeWind theme foundation (`theme/tokens.ts`, Tailwind config) (P0)
- Husky, commitlint, and lint-staged enforcing Conventional Commits on every
  commit (P0)
- Jest test runner with `jest-expo`, React Native Testing Library, and
  property-based testing via `fast-check` (P0)
- GitHub Actions CI running typecheck, lint, format check, tests, `expo-doctor`,
  and a dependency audit on every push/PR (P0)
- EAS build profiles (`development`, `preview`, `production`) with a registered
  EAS project (P0)
- Sentry crash reporting wired opt-in and off by default, no DSN committed (P0)
- Full design token system in `theme/tokens.ts` (color, space, radius, elevation,
  font, motion, hitSlop) consumed by both NativeWind classes and imperative code,
  per `docs/ARCHITECTURE.md` section 11 (P1)
- `components/ui` primitive library, 22 components (`Text`, `Button`, `IconButton`,
  `Chip`, `SegmentedControl`, `Card`, `Surface`, `ListRow`, `TextField`,
  `NumberField`, `StepperField`, `Switch`, `Slider`, `Checkbox`, `Avatar`, `Badge`,
  `StatTile`, `ProgressRing`, `Divider`, `Spacer`, `Section`, `SectionHeader`) (P1)
- `components/layout` (`Screen`, `KeyboardAvoider`, `Row`, `Column`) (P1)
- `components/feedback` (`EmptyState`, `Skeleton`, `ErrorState`, `Toast`,
  `UndoToast`, `ConfirmDialog`, `BottomSheet`, plus root-level toast/sheet hosts)
  (P1)
- `components/gestures` (`SwipeableRow`, `DraggableList`, `PressScale`) built on
  Reanimated worklets, no JS-thread work during a gesture (P1)
- `services/haptics`, a semantic haptics wrapper honoring the haptics-enabled
  setting (P1)
- i18n infrastructure: hand-rolled, compile-time-checked typed `t()` over an
  English-only catalog, plus `expo-localization` for device-locale reads (P1)
- Dev-only `/dev/gallery` route reviewing every primitive, variant, and state,
  excluded from production builds via a `__DEV__` guard (P1)
- Full SQLite schema (`database/schema.sql`, `database/migrations/001_initial.ts`)
  per `docs/ARCHITECTURE.md` section 7, applied through a migration runner with a
  forward-version guard (P2)
- `database/client.ts` and `ExpoSqlExecutor`, plus a `node:sqlite`-backed
  `NodeSqlExecutor` for tests/CI/benchmarks, and `database/diagnostics.ts` (schema
  version, row counts, file size, integrity check, SQLite build info) (P2)
- Shared repository infrastructure: `repositories/contracts`, `repositories/base`
  (`BaseSqliteRepository`), `repositories/mapping`, and `repositories/query` (P2)
- `services/id` (UUIDv7), `services/clock`, `services/kv` (typed MMKV wrapper),
  `services/files`, `services/logging`, and `services/container.ts` as the
  composition root (P2)
- `repositories/settings/SqliteSettingsRepository`, covering all 14 v1 settings
  keys with Zod validation and default-fallback (P2)
- Exercise catalog build pipeline (`scripts/build-catalog.ts`) fetching from
  `yuhonas/free-exercise-db`, downscaling imagery to 512px WebP, and emitting a
  deterministic, Zod-validated catalog (873 exercises, 1721 deduplicated images),
  plus an idempotent, versioned `catalogSeeder` (P2)
- `scripts/generate-perf-fixture.ts` and a CI performance-regression benchmark
  suite (`__tests__/database/benchmarks.perf.test.ts`) per `docs/adr/0014` (P2)
- Dev-only `/dev/db-health` route showing schema version, row counts, file size,
  integrity check, and SQLite build info, reusing existing P1 primitives (P2)
- New dependencies: `react-native-nitro-modules` (MMKV's native peer) and `sharp`
  (build-time-only, exercise catalog image processing) (P2)
- 5-tab navigation shell (`app/(tabs)/_layout.tsx`: Home, Plans, Exercises, Stats,
  Profile) using `@expo/vector-icons` (Ionicons) - resolves the P0-P2 "no icon
  library chosen yet" gap. Plans, Exercises, and Stats render a genuine "not built
  yet" empty state pending their own phase (P3)
- Root boot sequence (`app/_layout.tsx`): opens the database, runs migrations,
  builds the `AppContainer`, holds the splash screen until the profile query
  resolves, then gates to onboarding or the tab bar (P3)
- Onboarding flow (`app/onboarding/index.tsx`, `features/onboarding/*`): required
  nickname, optional avatar via `expo-image-picker`, skippable, graceful
  permission-denial handling (P3)
- `features/profile/*`: `ProfileRepository`/`SqliteProfileRepository` over the
  existing `user_profile` table, `ProfileService` (avatar write-then-commit
  ordering per ADR-0012), profile screen, and settings screens (units kg/lb and
  cm/in, haptics toggle, about) (P3)
- `domain/Weight.ts` and `domain/Length.ts` fleshed out from P1-era stubs to the
  full ADR-0009 conversion/rounding/display-formatting spec, with `fast-check`
  round-trip property tests (P3)
- New `haptics.enabled` settings key (15th v1 key), mirrored into MMKV for
  synchronous reads in gesture/press handlers per ADR-0008, SQLite remaining
  authoritative (P3)
- `navigation/routes.ts`, typed route helpers per `docs/ARCHITECTURE.md` section
  10.2 (P3)
- New dependencies: `expo-image-picker`, `@expo/vector-icons`,
  `@hookform/resolvers`, `expo-dev-client` (P3)
- `features/exercise-library/*`: library screen with instant, diacritic-folded FTS5
  search, a multi-select filter sheet (muscle, equipment, body part, level, gym/home
  context, favorites), favorites-first ordering, and FlashList results; exercise
  detail screen with an image gallery, instructions, muscle/equipment tags, Polish
  name rendering (`formatExerciseName()`), a videos section, a personal note, and a
  per-exercise rest override; favorite toggle with haptics; custom exercise
  create/edit (React Hook Form + Zod); delete guarded by `listReferencingPlans` (P4)
- `ExerciseRepository`/`SqliteExerciseRepository`, maintaining the `exercise_fts`
  FTS5 index incrementally on every single-row write, and `ExerciseService`, added to
  `AppContainer` alongside P3's `profileRepository`/`profileService` pair (P4)
- Nested Stack navigator for the Exercises tab (`app/(tabs)/exercises/`: list ->
  detail -> create/edit), replacing the P3 placeholder tab (P4)
- `assets/exercises/imageMap.ts` and `assets/exercises/index.ts`
  (`getExerciseImageSource()`), a generated static lookup resolving catalog filenames
  to bundled images (P4)
- Exercise-search performance benchmark implemented in
  `__tests__/database/benchmarks.perf.test.ts`, previously `test.skip`'d pending this
  phase (P4)
- `features/plans/*`: plan list, detail, and day-editor screens
  (`PlanListScreen`/`PlanDetailScreen`/`PlanDayEditorScreen`), backed by
  `PlanRepository`/`SqlitePlanRepository` (the app's first aggregate-root feature
  repository) and a Zod-validated `PlanService`; plan-level delete is a hard
  `purgePlan` behind a confirm dialog (no undo), day/day-exercise delete is
  soft-delete-plus-undo-toast; `duplicatePlan`/`duplicateDay` disambiguate name
  collisions ("(copy)", "(copy 2)", ...); `setSupersetGroup` requires >=2 exercise
  ids to form or update a group (P5)
- Nested Stack navigator for the Plans tab (`app/(tabs)/plans/`: list -> detail ->
  day editor), replacing the "not built yet" placeholder tab (P5)
- `app/(modals)/`, the app's first modal route group, holding the new
  `ExercisePickerScreen` (multi-select sibling of the P4 library screen); its
  selection returns via a new `stores/exercisePickerStore.ts` Zustand store rather
  than route params, since the result is an unbounded exercise-id list (P5)
- `planRepository`/`planService` added to `AppContainer`, alongside P3's
  `profileRepository`/`profileService` and P4's `exerciseRepository`/
  `exerciseService` pairs (P5)
- `features/workout-logging/*`: the active workout screen
  (`ActiveWorkoutScreen`, `app/workout/active.tsx`), a root-level
  `fullScreenModal` route outside `(tabs)` per ADR-0007, with gestures
  disabled and Android hardware back intercepted into a minimize/finish/
  discard action sheet; a persistent `ActiveWorkoutBanner` docked above the
  tab bar while minimized (`app/(tabs)/_layout.tsx`) (P6)
- `WorkoutSessionRepository`/`SqliteWorkoutSessionRepository`, the app's
  second aggregate-root feature repository (session + exercises + sets +
  active state, one committed transaction per mutation, ADR-0005), following
  `PlanRepository`'s established pattern, and a Zod-validated
  `WorkoutSessionService`; `sessionRepository`/`sessionService` added to
  `AppContainer` (P6)
- Crash recovery (FR-19): a boot-gate extension in `app/_layout.tsx` reading
  the MMKV `session.active` flag once a profile exists, redirecting straight
  into `workout/active` for a fresh in-progress session or showing a
  finish-or-discard dialog for a stale one (ADR-0005); the polished Home
  "Resume" banner card remains P10 scope (P6)
- Set-type semantics (6 values per ADR-0006), superset grouping carried over
  read-only from the plan day, and drop sets chained via `parent_set_id` (P6)
- Minimal workout entry points ahead of the P10 home dashboard: a "Quick
  Start" button on Home (`useStartWorkout().startEmpty()`) and a per-day
  "Start workout" action on `PlanDetailScreen`/`PlanDayCard`
  (`startFromPlanDay`), both with a blocked-session dialog offering Resume
  when a workout is already in progress (P6)
- `stores/activeWorkoutStore.ts`, ADR-0008's one named exception to
  "Zustand is ephemeral UI state only" - mirrors the persisted active
  session under five governing rules (mount-only hydration, paired
  synchronous update plus dispatched write, database-wins reconciliation on
  write failure, clear on finish/discard, selector-only consumption) (P6)
- `WorkoutSummaryScreen` (`app/workout/summary/[sessionId].tsx`), the
  post-finish celebratory summary, reached from `useFinishDiscardWorkout`'s
  `finish()` instead of Home; share-as-image action via `react-native-view-shot`
  and `expo-sharing` (P9)
- `WorkoutHistoryListScreen`/`WorkoutHistoryDetailScreen`
  (`app/profile/history.tsx`, `app/history/[sessionId].tsx`): a paginated,
  month-grouped history list and a read-only session detail with an inline
  edit mode (add/remove exercises, edit/complete/delete sets) and a hard,
  no-undo "Delete workout" action (P9)
- `WorkoutSessionRepository`/`SqliteWorkoutSessionRepository` gain
  `listHistory`, `getSession`, `updateHistoricalSession`, and `deleteSession`;
  eleven granular mutation methods now also accept a `completed` session
  (previously `in_progress`-only, or in five cases with no session-status
  guard at all), each resyncing the session's denormalized totals and
  rebuilding affected personal records on a historical edit (P9)
- `features/workout-logging/domain/EstimatedCalories.ts`, a flat
  kcal-per-minute calculator backing a new `workout.showEstimatedCalories`
  settings key (default off, D-04) - see `docs/adr/0018-estimated-calories-formula.md` (P9)
- "Training history" row on `ProfileScreen` and an "Estimated calories"
  `Switch` row on `SettingsScreen` (P9)
- New dependencies: `react-native-view-shot`, `expo-sharing` (P9)
- `features/home/*` (13th feature): domain calculators
  (`StreakCalculator.ts` - consecutive-day streak with a "today not yet
  trained doesn't break it" grace rule, DST/midnight-boundary tested;
  `nextSuggestedPlanDay.ts` - `sort_order` rotation), a read-only
  `HomeDashboardRepository`/`SqliteHomeDashboardRepository` (no accompanying
  service, same shape as P8's `ExerciseHistoryRepository`), a composed
  `useHomeDashboard` hook (one `useQuery`), five dashboard cards
  (`ActivePlanCard`, `LastWorkoutCard`, `StreakCard`, `LatestPRCard`,
  `WeeklySummaryCard`), and `HomeScreen.tsx` (pull-to-refresh, loading/error/
  empty states) - replaces P6's placeholder Home tab, closing
  `docs/ROADMAP.md`'s MVP line (P10)
- `features/home/screens/PlanDayPickerScreen.tsx`, reached via a new
  `(modals)/plan-day-picker` route (`routes.modals.planDayPicker(planId)`),
  for `ActivePlanCard`'s "change day" action (P10)
- `homeDashboardRepository` added to `AppContainer`, the seventh feature
  repository pair after P3-P9's profile/exercise-library/plans/
  workout-logging/records/exercise-history ones (P10)
- `refreshControl` prop on `components/layout/Screen.tsx`, `HomeScreen.tsx`
  its first real caller (P10)
- `{ navigation: 'push' | 'replace' }` option on `useStartWorkout`'s
  `startFromPlanDay`/`startEmpty`/`resumeBlocked` (default `'push'`,
  every pre-existing caller unchanged) (P10)
- `docs/adr/0019-home-dashboard-read-model.md`, recording the decision to
  keep Home on its own lightweight read model rather than pull
  `StatisticsRepository` forward from P11 (P10)

### Fixed

- Five `SqliteWorkoutSessionRepository` methods (`setExerciseNote`,
  `addDropSet`, `deleteSet`, `restoreSet`, `uncompleteSet`) had no
  session-status guard at all, meaning any of them could previously write
  silently through a `discarded` session; closed alongside P9's own
  in-progress-or-completed guard extension on the six methods that already
  had one (P9)

- Exercise catalog seeding wired into the boot sequence (`app/_layout.tsx` now calls
  `database/seed/runSeed()` after migrations, before `createContainer()`) - the
  seeder existed since P2 but was never called until P4 (P4)
- `database/seed/loadCatalogAsset.ts` now maps the catalog's
  `primaryMuscles`/`secondaryMuscles` fields into `catalogSeeder.ts`'s expected
  shape - previously every catalog exercise seeded with zero muscles (P4)
- `components/gestures/DraggableList.tsx` had no non-gesture reorder alternative
  (tracked "Known gaps" item since P1); closed in P5 with move-up/move-down
  `accessibilityActions`, across two rounds after a follow-up review found the
  first pass's fix didn't reach a native accessibility node through the real row
  components - see `CLAUDE.md`'s "Known gaps" for the full detail (P5)
- `WorkoutSessionRepository`'s first draft shipped with no write path for
  exercise or workout notes (FR-16); surfaced during review and closed
  before commit with `setExerciseNote`/`setSessionNotes` plus their
  `WorkoutSessionService` validation and test coverage (P6)
- `PlanDayPickerScreen`'s original push-then-self-pop navigation design was
  unsound (broken on the resume-from-blocked path, and - per
  `expo-router`'s actual `goBack` bubbling semantics - unsound in principle
  even on the direct-start path); fixed with the new `useStartWorkout`
  navigation option and `router.replace` instead of push-then-pop (P10)
- `app/(modals)/plan-day-picker.tsx` originally contained the full screen
  body, violating the "`app/` never contains screen bodies" rule; extracted
  into `features/home/screens/PlanDayPickerScreen.tsx` (P10)
- `useHomeDashboard.ts`'s two plan-dependent reads ran sequentially despite
  no dependency between them; now run via `Promise.all` (P10)
- `useHomeDashboard.ts` duplicated `StreakCalculator.ts`'s calendar-math
  primitives verbatim; `StreakCalculator.ts` now exports
  `ONE_DAY_MS`/`parseLocalDate`/`formatLocalDate` for reuse (P10)
- `features/home/components/formatHomeDuration.ts` duplicated
  `workout-logging`'s `formatSessionDurationSeconds` byte-for-byte;
  `workout-logging`'s barrel now exports it and `home` delegates instead of
  reimplementing (P10)
- `PlanDayPickerScreen` never announced its loading/empty state, and its
  day-row's `onPress`-nulling pattern silently discarded its own
  `accessibilityRole`/label/`busy` state while a start was in flight
  (A11Y-P10-001/A11Y-P10-002); both fixed with real regression tests
  (`reports/accessibility-2026-08-18-p10.md`) (P10)

### Security

- Path traversal hardening in `services/files/ExpoFileStorage.ts`, the sole low
  finding from the P3 security review (`reports/security-2026-08-05-p3.md`, 0
  critical/high/medium) (P3)
- Routine security review found zero issues (`reports/security-2026-08-06-p4.md`)
  (P4)
- Routine security review found zero critical/high/medium issues, one
  low/informational note on a non-atomic multi-exercise-add batch
  (`reports/security-2026-08-06-p5.md`) (P5)
- Routine security review found zero critical/high/medium issues, two low
  notes (a `setSupersetGroup` update missing a `deleted_at IS NULL` filter,
  mirroring an already-accepted P5 finding; `saveActiveState` lacking a Zod
  schema at the service layer, not exploitable since every field it writes
  is an id or a bound numeric column) (`reports/security-2026-08-07-p6.md`)
  (P6)
- Routine security review found zero critical/high/medium issues, one low
  (the pre-existing `ConfirmDialog` double-tap gap, now behind the first
  genuinely irreversible hard delete it has ever gated, still non-corrupting),
  one informational note (`reports/security-2026-08-13-p9.md`) (P9)
- Routine security review found zero critical/high/medium/low findings,
  three informational notes (full parameterization and consistent
  `deleted_at IS NULL` filtering in the new `SqliteHomeDashboardRepository`
  queries, additive/non-regressing `useStartWorkout` navigation option, no
  new dependency) (`reports/security-2026-08-18-p10.md`) (P10)
