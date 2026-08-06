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

### Security

- Path traversal hardening in `services/files/ExpoFileStorage.ts`, the sole low
  finding from the P3 security review (`reports/security-2026-08-05-p3.md`, 0
  critical/high/medium) (P3)
