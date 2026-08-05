# CLAUDE.md

Read this before touching this repo. Full depth lives in `docs/ARCHITECTURE.md`,
`docs/ROADMAP.md`, and `docs/adr/*` - this file is a distilled, machine-readable
reference, not a replacement. Section numbers below refer to `docs/ARCHITECTURE.md`.

## Status

P0 (project foundation), P1 (design system and UI primitives), and P2 (persistence
foundation) are complete. No feature screens exist yet - `features/*` are still empty
skeleton directories (components/hooks/screens/services/domain/repository/types/
index.ts subfolders, no implementation); P2 built the data layer and infrastructure
those features will sit on, not feature code itself. `app/index.tsx` is a real,
finished minimal Home screen, not a placeholder. A dev-only `/dev/db-health` route
(`app/dev/db-health.tsx`, same `__DEV__`-guarded `Redirect` pattern as `/dev/gallery`)
shows schema version, last migration, per-table row counts, file size, `PRAGMA
integrity_check`, SQLite version/compile options, and FTS5/partial-index
availability. Implementation proceeds one roadmap phase at a time per
`docs/ROADMAP.md` (P0-P16) - never skip ahead to a later phase's feature before the
current phase is committed.

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

## Product

Offline-only React Native/Expo workout logging app. No backend, no accounts, no
cloud sync. Dark mode only. Bundle id `com.konradmalinowski.gymtracker`. Min OS: iOS
15+, Android 8 / API 26+. Package manager: npm.

## Stack

Expo + TypeScript (strict) + Expo Router (typed routes) + Zustand (ephemeral UI
state only) + TanStack Query + Expo SQLite + React Hook Form + Zod + MMKV (requires
`react-native-nitro-modules` as its native peer - a pod install/prebuild step
before the next device run) + FlashList + Reanimated + Gesture Handler + Victory
Native XL (wrapped in a
`components/charts` adapter per ADR-0010) + React Native SVG + Expo Notifications +
Expo Haptics + Expo FileSystem + NativeWind (`tailwind.config.js` imports
`theme/tokens.ts`, never duplicates values).

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

Eleven features total: `onboarding`, `profile`, `exercise-library`, `plans`,
`workout-logging`, `rest-timer`, `records`, `statistics`, `body-metrics`,
`calendar`, `data-transfer`.

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
- `repositories/settings/SqliteSettingsRepository` covers all 14 v1 settings keys,
  Zod-validated with default-fallback on a missing or corrupt stored value. It sits
  as a top-level sibling of `repositories/{base,mapping,query}` rather than under a
  feature - cross-cutting, and it doesn't fit the `ReadRepository`/`WriteRepository`
  shape - the same kind of deviation as the root `domain/` folder noted above.
- `services/container.ts` (`AppContainer`/`createContainer`/`ContainerProvider`/
  `useContainer`) is the composition root. It's deliberately smaller than section
  8.4's full shape - feature repositories (`exercises`, `plans`, `sessions`, etc.)
  don't exist yet and land one at a time from P4 onward, each phase extending
  `AppContainer` rather than replacing it. `services/kv` is intentionally not a
  container member (ADR-0008: MMKV holds boot-critical flags read before the
  database opens).
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
aggregation); two benchmarks are `test.skip`'d with a comment naming the future
phase that implements them (exercise search - P4, JSON export - P9), not silently
omitted.

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
- EAS project registered (`@konradxmalinowski/gymtracker`), `eas.json` has
  `development`/`preview`/`production` build profiles.
- Sentry (`@sentry/react-native`) config plugin is wired unconditionally in
  `app.config.ts`, but crash reporting defaults to **off** and no DSN is committed
  (read from `SENTRY_DSN`, unset in this repo and in CI). The user-facing toggle
  and the only `Sentry.init()` call site land in P15 (settings) - do not add error
  boundaries or capture call sites before then, there's no feature code to
  instrument yet.

## Known gaps (tracked, non-blocking)

- **`components/gestures/DraggableList.tsx` has no non-gesture reorder
  alternative.** It is gesture-only today - no consumer exists yet, so this doesn't
  block P1, but it is a real accessibility gap for whichever feature phase consumes
  it for actual reordering (the roadmap's `plans` feature, reordering exercises
  within a plan day, is the likely first consumer). That phase MUST add an
  accessibility-action-based alternative (e.g. move-up/move-down actions) before
  shipping - mirror how `SwipeableRow` exposes its swipe actions via
  `accessibilityActions`/`onAccessibilityAction` (see `SwipeableRow.tsx`'s
  `cloneElement`-based merge onto a single child, not the outer `View`). Do not ship
  drag-only reordering as the final state. Source: accessibility audit finding
  A11Y-005, `reports/accessibility-2026-08-05-p1.md`.
- **No icon library chosen yet.** Every icon-accepting prop across `components/ui`
  is typed `ReactNode`, with `Text`-glyph placeholders standing in (e.g. `Checkbox`'s
  checkmark, `DraggableList`'s grip dots). The first feature phase that needs real
  iconography must make this choice. `react-native-svg` is already a dependency, so
  a hand-built SVG icon set or `@expo/vector-icons` are the live options - pick one
  and use it everywhere, don't let two icon systems coexist.

## Further reading

- `docs/ARCHITECTURE.md` - full architecture document (this file's source)
- `docs/ROADMAP.md` - the 17-phase build plan (P0-P16)
- `docs/adr/` - individual architecture decision records
- `docs/architecture-snapshot.md` - condensed synthesis for orchestration/agent use
