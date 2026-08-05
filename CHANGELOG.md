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
