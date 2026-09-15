# CLAUDE.md

Read this before touching this repo. Full depth lives in `docs/ARCHITECTURE.md`,
`docs/ROADMAP.md`, and `docs/adr/*` - this file is a distilled, machine-readable
reference, not a replacement. Section numbers below refer to `docs/ARCHITECTURE.md`.
Phase-by-phase implementation history (what P4-P17 each did, why, and what each
review pass found) is not repeated here - it lives in git history and
`docs/ROADMAP.md`; this file states current state only.

## Status

P0-P15 and P17 are complete: project foundation, design system/UI primitives,
persistence foundation, onboarding/profile/settings, exercise library, workout
plans, workout logging, rest timer, progressive overload/personal records, workout
summary/history, home dashboard, statistics/charts, training calendar, body
measurements/progress photos, data export/import, performance hardening/polish, and
daily goals/reminders. P16 (release engineering) remains unbuilt.

P15 (performance hardening and polish): the Ionicons deep-import fix
(`@expo/vector-icons/Ionicons` default import instead of the barrel's named import)
applied across ~55 files, removing ~4MB of unused icon-font weight from the bundle.
`ActiveWorkoutScreen.tsx`'s `renderItem` is now a stable `useCallback` (previously
an inline arrow function recreated every render) with a memoized
`exerciseHandlersById` map and a memoized `extraData`; `SetRow`/`SessionExerciseCard`
are wrapped in `React.memo`; `stores/activeWorkoutStore.ts`'s `deleteSet` reducer
now preserves object identity for exercises a deleted set doesn't belong to, so the
memoization above actually holds. `hooks/useRenderCount.ts` (dev-only) is wired into
both. FlashList prop tuning on `ExerciseLibraryScreen`/`ExercisePickerScreen`/
`WorkoutHistoryListScreen`/`PersonalRecordsScreen` needed no changes -
`keyExtractor`/`getItemType` were already correct pre-P15; `estimatedItemSize` was
deliberately not reintroduced anywhere, since flash-list v2 removed the prop. Five
components (`Checkbox`, `RestTimerBar`, `ActiveWorkoutBanner`, `PRBadge`,
`TodayGoalRow`) gained Reanimated micro-interactions using existing
`theme/tokens.ts` motion tokens, no new dependency. Empty/error/loading-state and
accessibility audits across every screen found nothing needing a fix beyond the
Badge finding below. Verified live on the `gymtracker_test` Android emulator
(`npx expo run:android`, golden path end to end, zero crashes), including a
500-session/15,000-set soak test of the training-history FlashList. NFR-03
(exercise search) reconfirmed at 30ms against the 50ms budget via the benchmark
suite, a clean DB-layer pass; NFR-02 (cold start) and NFR-04 (history-list scroll)
were measured but only on a debug dev-client build on an emulator, not
representative of production at the time - a later release-build re-measurement
(post-P15 known-gaps sweep) confirmed NFR-02 passing; NFR-04 remains open - see
Known gaps.

Thirteen features total, each with real implementations under `features/`:
`onboarding`, `profile`, `exercise-library`, `plans`, `workout-logging`,
`rest-timer`, `records`, `home`, `statistics`, `calendar`, `body-metrics`,
`data-transfer`, `daily-goals`. `rest-timer` owns no DB table/repository; `records`,
`body-metrics`, and `daily-goals` each have a repository (`body-metrics` and
`daily-goals` have two apiece) with an accompanying service; `home`, `statistics`,
and `calendar` each have a repository but deliberately no service (read models, see
Data layer below); `data-transfer` has one repository and one service.

Historical note kept for context: P8 (`feat/p8-progressive-overload`) was branched
before P7 merged, so `WorkoutSessionRepository`/`SqliteWorkoutSessionRepository.ts`,
`WorkoutSessionService.ts`, `services/container.ts`, `ActiveWorkoutScreen.tsx`, and
this file all needed a manual merge - already resolved, not an open branch note.

**Known gaps** (see the section near the bottom for the current, open list only -
resolved gaps have been removed from this file rather than kept as struck-through
history).

## Product

Offline-only React Native/Expo workout logging app. No backend, no accounts, no
cloud sync. Dark mode only. Bundle id `com.konradmalinowski.gymtracker`. Min OS: iOS
15+, Android 8 / API 26+. Package manager: npm.

## Stack

Expo + TypeScript (strict) + Expo Router (typed routes) + Zustand (ephemeral UI
state only) + TanStack Query + Expo SQLite + React Hook Form + Zod + MMKV (requires
`react-native-nitro-modules` as its native peer - a pod install/prebuild step before
the next device run) + FlashList + Reanimated + Gesture Handler + Victory Native XL
(wrapped in a `components/charts` adapter per ADR-0010) + React Native SVG + Expo
Notifications + Expo Haptics + Expo FileSystem + NativeWind (`tailwind.config.js`
imports `theme/tokens.ts`, never duplicates values) + `@expo/vector-icons` (Ionicons

- the app's only icon system; move any remaining `ReactNode`-typed icon prop onto it
  the next time that component is touched) + `expo-image-picker` + `expo-image-manipulator`
  - `expo-document-picker` + `expo-sharing` + `@hookform/resolvers` (Zod resolvers).

## Architecture and layering (section 3.1)

Clean Architecture, feature-sliced. Dependencies point inward only:
Presentation -> Application -> Domain <- Infrastructure. Four rules, all
mechanically enforced by `eslint.config.js` (a violation fails lint):

1. **Domain purity** - `domain/**` and `features/*/domain/**` must not import
   React, React Native, or Expo. `gymtracker/domain-purity`.
2. **SQLite boundary** - `expo-sqlite` may only be imported from `database/` or a
   feature's `repository/*.ts`. `gymtracker/sqlite-boundary` (+ `-exemptions` for
   those two locations).
3. **No direct repository access from presentation** - `app/`, `components/`, and
   any `features/*/screens` or `features/*/components` may not import
   `repositories/` or a feature's `repository/` directly; go through a feature
   service via a hook instead. `gymtracker/architecture-layering`
   (`import/no-restricted-paths` zones).
4. **Cross-feature imports only through a barrel** - reaching into
   `features/x/internal-thing` from `features/y` is a lint error; import from
   `features/x` (its `index.ts`) instead. `crossFeatureBarrelZones` in the same
   block.

Import cycles anywhere are banned (`import/no-cycle`, `error`).

CQRS-lite: statistics/history read through dedicated read-model repositories
returning flat SQL-aggregated DTOs - never load-all-then-sum-in-JS. Aggregate
boundary: a workout session + its exercises + its sets is one repository, one
transaction.

## Folder structure (section 9)

`app/` (routing only), `assets/`, `components/` (cross-feature, zero domain
knowledge: `ui/`, `layout/`, `feedback/`, `charts/`, `gestures/`), `database/`
(`client.ts`, `DatabaseProvider.tsx`, `migrations/`, `schema.sql`, `seed/`, `sql/`),
`domain/` (shared cross-feature value objects, see deviation below), `features/`
(one directory per feature, each with `components/hooks/screens/services/domain/
repository/types/index.ts`), `hooks/`, `navigation/`, `repositories/` (shared
infra: `contracts/`, `base/`, `mapping/`, `query/`), `services/` (`container.ts`
composition root, `files/`, `notifications/`, `haptics/`, `kv/`, `clock/`, `id/`,
`logging/`), `stores/` (Zustand, ephemeral UI state only), `theme/`, `types/`,
`utils/`, `__tests__/`, `.maestro/`.

Two load-bearing rules:

- `app/` never contains screen bodies - only thin wrappers into `features/*/screens`.
- `components/` may never import from `features/` (enforced, see rule 1 above).

**Deviation from the section 9 tree**: a project-root `domain/` folder exists for
`Weight.ts` and `Length.ts` - value objects shared across workout-logging,
body-metrics, and statistics with no single natural owner. `@/domain/*` is a real
tsconfig path alias, covered by the domain-purity ESLint rule. Not yet reflected
into `docs/ARCHITECTURE.md` section 9 (cosmetic, non-blocking).

## Module dependency graph (section 9.1)

- `exercise-library` and `body-metrics` are leaves: no dependency on `plans`,
  `workout-logging`, `records`, or (for `body-metrics`) any other feature.
- `plans` depends on `exercise-library` only.
- `workout-logging` is the hub: depends on `exercise-library`, `plans`,
  `rest-timer`, `records`. Nothing depends on `workout-logging` except read-side
  features (`statistics`, `calendar`, `home`, `data-transfer`).
- `rest-timer` and `records` do **not** depend on `workout-logging` - they are
  called by it. Inverting this creates a cycle.
- `daily-goals` is a leaf, deliberately isolated from `plans`/`workout-logging`/
  `exercise-library` - goals are user-defined and not tied to training days or
  workout state. `home` is its only dependent (`TodaysGoalsCard`, read-only).
- `home` depends on `workout-logging`, `plans`, and `records` (read-only, one
  direction). It does **not** depend on `statistics` despite the architecture
  diagram's `HOME --> STAT` edge - `docs/adr/0019-home-dashboard-read-model.md`
  settles this permanently: `home` keeps its own lightweight `HomeDashboardRepository`
  forever, since `statistics` never implements `streak()`/`weeklySummary()`.
- `statistics` depends only on read models, never write services. One real edge,
  `STAT --> REC`: `exerciseProgression`'s `e1rm` metric reuses `records`' pure
  `estimated1RM`/`isRecordEligibleSetType` domain calculator (not a service call).
  It does not depend on `workout-logging` - its repository reads
  `v_working_set`/`workout_session` directly.
- `calendar` likewise does not depend on `workout-logging` in practice, despite the
  diagram's `CAL --> WL` edge - `docs/adr/0020-calendar-read-model.md` resolves
  this the same way ADR-0019 does for statistics: `CalendarRepository` reads
  `v_session_summary`/`v_working_set` directly. No edge to `statistics` or `home`
  either (its intensity-binning/calendar-math primitives are a deliberate small
  duplication, not an import).
- `data-transfer` depends on everything and is built last.

## Data layer (sections 7-8)

- SQLite via Expo SQLite, UUIDv7 TEXT primary keys everywhere (sync-readiness).
- Timestamps: epoch ms UTC plus a separate `local_date` (`YYYY-MM-DD`) column on
  every entity the user perceives as "a day."
- Units always stored as kg (weight) / cm (length). Unit conversion happens **only**
  in `domain/Weight.ts` and `domain/Length.ts`, enforced by
  `gymtracker/unit-conversion-boundary` (`no-restricted-syntax` bans the known
  kg<->lb and cm<->in conversion-factor literals - `2.20462`, `0.45359237`, `2.54`,
  `0.393701` - anywhere else, via `-exemptions` for those two files).
- Exercise catalog data (`exercise`) is separated from user data
  (`exercise_user_data`) so a catalog update never destroys favorites/notes.
- No `change_log` table or `findChangedSince()` - only sync-readiness primitives
  that pay for themselves today (ADR-0004).
- Three partial unique indexes enforce single-active-row invariants:
  `ux_plan_single_active`, `ux_session_single_in_progress`, `ux_pr_current`.
  (`docs/ROADMAP.md` says "two" for the P2 line - `docs/ARCHITECTURE.md` section 7
  is authoritative and defines three; the roadmap wording is stale.)
- `database/client.ts` opens the connection with WAL journaling,
  `synchronous=FULL`, `foreign_keys=ON`, a busy timeout, and `temp_store=MEMORY`,
  and exposes `ExpoSqlExecutor`. `database/node/NodeSqlExecutor.ts` runs the same
  schema on `node:sqlite` for tests/CI/benchmarks (chosen over `better-sqlite3` to
  avoid a native compile step; CI pins Node 24 for `node:sqlite` support).
- `database/diagnostics.ts` reports schema version, per-table row counts, file
  size, `PRAGMA integrity_check`, last migration, SQLite version/compile options,
  and FTS5/partial-index availability - backs the `/dev/db-health` route
  (`app/dev/db-health.tsx`, `__DEV__`-guarded `Redirect`, same pattern as
  `/dev/gallery`), which also has its own "Progress photo integrity" section via
  `progressPhotoService.verifyIntegrity()`.
- `repositories/contracts/` defines `SqlExecutor`/`DatabaseContext`/
  `ReadRepository`/`WriteRepository`. `repositories/base/BaseSqliteRepository`
  handles id generation, audit stamping, injected-`Clock` `local_date` computation,
  and generic soft delete/restore/purge. `repositories/mapping/` holds
  case-conversion and bool/JSON codecs. `repositories/query/` provides a
  parameterized `WhereClause`, a whitelisted `orderBy`, and clamped limit/offset
  (100-row clamp).
- `repositories/settings/SqliteSettingsRepository` covers every v1 settings key,
  Zod-validated with default-fallback on a missing/corrupt stored value. A
  top-level sibling of `repositories/{base,mapping,query}`, not a feature.
- `services/container.ts` (`AppContainer`/`createContainer`/`ContainerProvider`/
  `useContainer`) is the composition root - one feature-repository pair added per
  phase (profile, exercise-library, plans, workout-logging, records +
  exercise-history, home, statistics, calendar, body-metrics x2, data-transfer,
  daily-goals x2). `services/kv` is intentionally not a container member
  (ADR-0008: MMKV holds boot-critical flags read before the database opens).
- Exercise catalog: `scripts/build-catalog.ts` fetches from
  `yuhonas/free-exercise-db`, downscales imagery to 512px WebP via `sharp`,
  content-hash-dedupes, and emits `assets/data/exercises.catalog.json`
  (deterministic, Zod-validated) plus `exercises.pl.json`/`exercises.videos.json`
  overlays (currently empty - 0% video coverage). `CATALOG_VERSION` hardcoded
  `"1"`. `assets/exercises/imageMap.ts` (1721 entries, generated by
  `scripts/build-exercise-image-map.ts`) resolves a catalog filename to a static
  Metro `require()`. An idempotent `catalogSeeder` (`database/seed/runSeed()`)
  loads the catalog into the DB on every boot without touching
  `exercise_user_data`; `rebuildExerciseFts` is exported for reuse by
  `data-transfer`'s post-import rebuild.
- Two real schema migrations exist beyond `001_initial.ts` (which shipped the full
  section 7 schema in one migration, applied via a `PRAGMA user_version` runner
  with a `migration_history` table and a forward-version guard):
  `002_add_sleep_and_height_metrics.ts` (widened `body_metric_entry`'s CHECK
  constraint via SQLite's create-copy-drop-rename rebuild pattern, since SQLite
  has no `ALTER TABLE ... ALTER COLUMN`) and `003_daily_goals.ts` (four new
  tables: `daily_goal`, `daily_goal_entry`, `daily_reminder`,
  `daily_reminder_response`).
- `services/notifications/NotificationScheduler.ts` is the shared scheduler ADR-0016
  planned; `RestTimerNotificationService` (feature-scoped, `rest-timer`) and
  `WorkoutReminderService` (cross-cutting, added in the Gravitus-refresh pass) are
  two further, still-independent local-notification code paths - migrating any of
  the three onto the shared scheduler is an open backlog item
  (`docs/adr/0016-shared-notification-scheduler.md`'s "P17 resolution" addendum).
  All three use disjoint notification-id prefixes and never call
  `cancelAllScheduledNotificationsAsync()`, so they do not conflict today.
  `app/_layout.tsx` registers a single shared `Notifications.setNotificationHandler()`
  at boot, right after `SplashScreen.preventAutoHideAsync()`, so all three paths now
  present correctly even while the app is foregrounded at fire time.

## i18n

`t()` (`i18n/translate.ts`) is a small, hand-rolled, compile-time-checked lookup
over an English-only catalog (`i18n/catalogs/en.ts`) rather than i18next/i18n-js -
v1 ships English-only (D-11), so a full i18n library buys nothing yet. Adding a
Polish catalog later is data-only (a new file under `i18n/catalogs/`), no call-site
refactor needed.

## Testing strategy (section 14)

- Domain layer: property-based tests (fast-check) for calculators - highest-value
  tests in the app.
- Repository layer: integration tests against real `schema.sql` via
  `NodeSqlExecutor` (`node:sqlite`, not mocks - skips a native compile step).
- Component layer: React Native Testing Library.
- E2E: Maestro (`.maestro/`).
- `__tests__/database/benchmarks.perf.test.ts` is a CI performance-regression
  suite (ADR-0014) against a 75,000-set fixture, with real assertions for
  previous-performance lookup, session detail load, one-year volume aggregation,
  exercise search, CSV/JSON export batching, and the calendar/statistics
  date-range queries.
- **Current policy: do not write new tests by default.** Recent phases (P13-P17)
  ran under an explicit user instruction to skip authoring new automated tests
  for app-code passes unless the user asks - run/fix the existing suite as the
  regression gate, but do not add coverage proactively.

## Tooling and CI (section 15)

- ESLint flat config (`eslint.config.js`) with the layering rules above, Prettier,
  Husky + lint-staged + commitlint. **Conventional Commits are enforced by a
  `commit-msg` hook** (`commitlint.config.js`, `@commitlint/config-conventional`,
  120-char header limit) - a malformed commit is rejected outright. `pre-commit`
  runs `lint-staged` (ESLint + Prettier on staged files) first.
- GitHub Actions (`.github/workflows/ci.yml`) runs `typecheck`, `lint`,
  `format:check`, `test:ci`, `expo-doctor`, and `audit:ci` (`npm audit
--audit-level=high`) on every push/PR to `main`.
- EAS project registered (`@konradxmalinowski-2/gymtracker`, `app.config.ts`'s
  `owner`/`extra.eas.projectId` = `9c25b5d1-7371-49ec-aaee-f6884a31e820`);
  `eas.json` has `development`/`preview`/`production` build profiles.
- Sentry (`@sentry/react-native`) config plugin is wired unconditionally, but
  crash reporting defaults to **off** and no DSN is committed (read from
  `SENTRY_DSN`, unset here and in CI). The user-facing toggle and the only
  `Sentry.init()` call site land in P15 - do not add error boundaries or capture
  call sites before then.
- No simulator/emulator was available in most implementing sessions through P12 -
  `npx expo export --platform ios` was used as a build-verification proxy. A real
  Android emulator (`gymtracker_test`, API 34, one arm64-v8a system image) became
  available starting with the post-P12 bugfix pass and has been used for live
  on-device verification since (P13-P17). **iOS remains unverified on-device
  throughout.** A fresh native build (`npx expo run:android`) is required after
  any phase that adds a new native dependency or a native permission/manifest
  change, not just a Metro reload.

## Standard project folders

`plans/`, `errors/`, `reports/`, `docs/` - always plural, no exceptions. Consolidate
into the plural folder if a singular-named one exists from earlier, inconsistent
work.

## Known gaps (tracked, non-blocking)

- **Android 13+ has no in-app path to grant `SCHEDULE_EXACT_ALARM`.** The user
  must separately enable it via Settings > Apps > GymTracker > Alarms & reminders;
  this app has no deep link into that screen yet. Real, scoped UI work for a
  future pass.
- **A dev-only "state update on unmounted component" React warning was
  investigated and could not be reproduced or isolated to a call site.** React
  19 (this project's installed version) removed the classic warning entirely -
  `setState` on an unmounted function component is now a silent no-op, not a
  console warning - confirmed by an exhaustive grep of the entire `node_modules`
  tree finding zero occurrences of the warning text anywhere in the dependency
  chain. All four real subscription/async-boot sites (`app/_layout.tsx`'s boot
  chain, `hooks/useAppState.ts`, `useRestTimerTick.ts`, `BottomSheet.tsx`) were
  re-audited and already guard cleanup correctly. If this recurs on a real
  device, it is likely React Fabric's similarly-worded but distinct "hasn't
  mounted yet" render-phase warning, not the classic one - re-transcribe it
  verbatim from LogBox before investigating further.
- **NFR-02 (cold start) is confirmed passing on a release build; NFR-04
  (workout-history scroll, 1000+ sessions) remains open and is structurally
  difficult to close.** A real release APK (not debug) was built and installed
  on the `gymtracker_test` emulator; `adb shell am start -W`, run twice after
  the one-time catalog-seed on first install, measured 686ms and 557ms cold
  start, both comfortably under the 1.5s budget - Hermes-precompiled bytecode,
  no dev-mode overhead, a real and representative number. NFR-02 is CONFIRMED
  PASSING. NFR-04 could not be re-measured on the release build: the
  large-fixture seeding tool used for the earlier debug-build measurement was
  temporary `__DEV__`-gated dev tooling (a button on `/dev/db-health`, already
  reverted), which a release build compiles out entirely - there is no way to
  seed 500+ synthetic sessions into a release build's database without either
  shipping dev-tooling in a release build (wrong) or building a separate
  instrumented release-adjacent variant (out of scope for this pass). The
  existing debug-build numbers remain the only measurement taken (25.11%
  janky/34ms median frame time on a gentle scroll, 53.12% janky/53ms median on
  an aggressive fling), still caveated as debug-build/emulator-not-
  representative. Closing this out for real needs either a real device test
  against a real user's accumulated history or a proper instrumented
  release-variant build pipeline - P16-adjacent infrastructure work, not a
  quick fix. Zero crashes were observed on the release build across
  onboarding, Home, and basic navigation (`logcat` FATAL
  EXCEPTION/AndroidRuntime grep clean).

Two icon-library and `DraggableList`/`SwipeableRow` accessibility-collapse
concerns tracked in earlier phases were verified false or resolved during P15's
on-device Android accessibility pass (real `uiautomator dump` evidence that RN's
`accessible={true}` does not collapse nested focusable descendants on Android the
way iOS's UIAccessibility model does) - removed from this list rather than kept as
struck-through history; iOS remains unverified for both.

## Further reading

- `docs/ARCHITECTURE.md` - full architecture document (this file's source)
- `docs/ROADMAP.md` - the 17-phase build plan (P0-P16)
- `docs/adr/` - individual architecture decision records
- `docs/architecture-snapshot.md` - condensed synthesis for orchestration/agent use
