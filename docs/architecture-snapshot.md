---
snapshot_commit: fbda52da0f4833b31c24ca76a5e6a83a088c0da6
generated_from: docs/ARCHITECTURE.md, docs/ROADMAP.md, docs/adr/*, docs/PRODUCT-BRIEF.md
---

# GymTracker - architecture snapshot

Condensed synthesis for orchestration use. Full detail lives in docs/ARCHITECTURE.md
(section numbers referenced below) - re-read the source section when a decision needs
verification, this file is a pointer, not a replacement.

## Product

Offline-only React Native/Expo workout logging app. No backend, no accounts, no cloud.
Core promise: log a set in 2-3 seconds. Dark mode only. Working name GymTracker,
bundle id `com.konradmalinowski.gymtracker`. Min OS: iOS 15+, Android 8 / API 26+.
Package manager: npm. GitHub: konradxmalinowski/gymtracker (public).

## Stack (fixed)

Expo (current SDK) + TypeScript strict + Expo Router (typed routes) + Zustand +
TanStack Query + Expo SQLite + React Hook Form + Zod + MMKV + FlashList + Reanimated +
Gesture Handler + Victory Native XL (Skia-based, wrapped in components/charts adapter
per ADR-0010) + React Native SVG + Expo Notifications + Expo Haptics + Expo FileSystem +
NativeWind (tailwind.config.js imports theme/tokens.ts, never duplicates values).

## Architecture (section 3)

Clean Architecture, feature-sliced. Layers, dependencies point inward only:
Presentation -> Application -> Domain <- Infrastructure (Infrastructure implements
ports the domain/feature declares). Enforced by ESLint `import/no-restricted-paths`,
set up in P0. Cross-feature imports only through a feature's `index.ts` barrel -
reaching into `features/x/internal` from `features/y` is a lint error.

CQRS-lite: statistics/history go through dedicated read-model repositories returning
flat SQL-aggregated DTOs, never load-all-then-sum-in-JS. Aggregate boundary: a workout
session + its exercises + its sets is one repository, one transaction (crash safety +
future sync conflict unit).

## Folder structure (section 9)

Top level: app/ (routing only, thin wrappers into features/*/screens), assets/
(fonts, images, bundled exercise WebP images, exercises.catalog.json /
exercises.pl.json / exercises.videos.json), components/ (cross-feature, zero domain
knowledge - ui/, layout/, feedback/, charts/, gestures/), database/ (client.ts,
DatabaseProvider.tsx, migrations/, schema.sql, seed/, sql/), features/ (one dir per
feature: onboarding, profile, exercise-library, plans, workout-logging, rest-timer,
records, statistics, body-metrics, calendar, data-transfer - each with
components/hooks/screens/services/domain/repository/types/index.ts), hooks/,
navigation/, repositories/ (shared infra: contracts/, base/, mapping/, query/),
services/ (container.ts composition root, files/, notifications/, haptics/, kv/,
clock/, id/, logging/), stores/ (Zustand, ephemeral UI state only), theme/, types/,
utils/, __tests__/, .maestro/.

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

SQLite via Expo SQLite. UUIDv7 TEXT primary keys everywhere (sync-readiness, ADR
tied to this). Timestamps: epoch ms UTC plus a separate `local_date` (YYYY-MM-DD)
column on every entity the user perceives as "a day" (streaks, calendar) - without
it, timezone travel breaks both. Weights always stored in kg, lengths in cm;
unit conversion only in the presentation layer (domain/Weight.ts, domain/Length.ts -
ESLint bans unit-conversion constants anywhere else). Exercise catalog data is
separated from user data (`exercise` vs `exercise_user_data`) so a catalog update
never destroys favorites/notes. WAL + `synchronous=FULL`. In-progress workout has no
separate "draft" concept - it's a `workout_session` row with `status='in_progress'`,
committed after every set; a partial unique index makes two simultaneous active
sessions impossible at the DB level. Rest timer deadline is stored as an absolute
timestamp in the DB, not a JS interval - survives process death/Doze.

Set types: 6 values (Warm-up, Normal, Drop Set, Failure, Assisted, Partial) -
**not** 7. Superset is modeled as a relation between exercises (`superset_group`),
not a set-type value (approved deviation from the original brief, ADR-0006). Drop
sets chain via `parent_set_id`. A normative semantics table governs what counts
toward volume/PR/set-count; a test keeps the SQL view and the TS calculator from
drifting apart. Assisted sets are excluded from volume/PR calculation in v1
(decision D-02) - deliberately not reordering body-measurements earlier to support
weight-relative assisted-set math.

Repository tests run in Node against real `schema.sql` on better-sqlite3 (a
`SqlExecutor` port), not mocks.

Sync-readiness: only what pays for itself today (UUIDs for idempotent import,
`updated_at` for merge, soft delete for undo, aggregate transactions, a `rebuild()`
for derived data, an optional `tx` param on repository methods). No `change_log`
table, no `findChangedSince()`, no dead scaffolding for a sync layer that doesn't
exist yet (ADR-0004).

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
- D-05: Sentry crash reporting is opt-in, disabled by default, **and must be wired
  in P0** (config plugin + default-off toggle), not deferred to the P16 store-
  privacy-declarations phase - a native config change right before store submission
  is the worst possible timing.
- D-06: progress photos excluded from JSON export (base64 photos risk OOM on
  weaker Android devices).
- D-07: CSV import from Strong/Hevy deferred past v1.
- Remaining D-08..D-12 are backlog-tier, non-blocking; see section 18 for detail
  if a later phase needs them.

## Roadmap (docs/ROADMAP.md)

17 phases (P0-P16), one Conventional Commit per phase, feature-by-feature -
never move to the next phase until the current one is complete and committed.
MVP line closes after P10: P0 project foundation, P1 design system/UI primitives,
P2 exercise catalog build + bundling, P3 database schema + migrations, P4 exercise
library feature, P5 onboarding, P6 workout plans, P7 workout logging (the core
2-3-second-set screen), P8 rest timer, P9 workout summary + PRs, P10 home screen.
P11-P16: statistics, calendar, body measurements, CSV/JSON export-import, settings,
store submission prep (including the D-05 privacy declarations).

Ordering is dependency-driven: exercise-library is a leaf and ships before plans/
workout-logging can consume it; rest-timer and records exist before workout-logging
because workout-logging is the hub that calls them.

## CI/CD and tooling (section 15, P0 scope)

ESLint flat config with the layering rules above, Prettier, Husky + lint-staged +
commitlint (Conventional Commits enforced by hook), Jest + jest-expo + React Native
Testing Library + fast-check, GitHub Actions running tsc --noEmit / eslint /
prettier --check / jest / expo-doctor / npm audit --audit-level=high on every push
and PR, EAS project with development/preview/production build profiles.

## Testing strategy (section 14)

Domain layer: property-based tests (fast-check) for calculators (1RM, volume, PR
detection) - these are the highest-value tests in the app. Repository layer:
integration tests against real schema.sql via better-sqlite3, not mocks. Component
layer: React Native Testing Library for interaction-critical components (set row,
quick-adjust chips). E2E: Maestro flows for the golden path (start workout -> log a
set -> finish).

## What this snapshot deliberately omits

Full DDL (section 7), the complete theme token values (section 11), the full
navigation route table (section 10), and the per-phase acceptance criteria in
ROADMAP.md are not duplicated here - read the source when a phase actually needs
them, since copying them risks drift between this snapshot and the source of truth.
