---
plan: plans/2026-08-05-p2-persistence-foundation.md
branch: feat/p2-persistence-foundation
last_updated: 2026-08-05T08:15:00Z
---

# P2 persistence foundation - live state

## Current step

Steps 1 and 2b both done and reported. Integration check (Step 5) found one real
conflict: `scripts/tsconfig.json` (added by 2b) has `include: ["**/*.ts"]`, which
sweeps up step 1's `scripts/generate-perf-fixture.ts` and fails to resolve its `@/`
path aliases (no `paths` mapping in that scoped config); root `tsconfig.json`'s
`exclude: ["scripts"]` (also added by 2b) drops that same file from the main
typecheck too, so it currently falls into a gap covered by neither config.
Reproduced directly: `npx tsc --noEmit -p scripts/tsconfig.json` fails with 4
`TS2307: Cannot find module '@/...'` errors. No other file conflicts - `git status`
confirms disjoint file sets otherwise. Resumed the 2b agent (it owns both tsconfig
files) with the fix: narrow both configs to explicit file lists instead of blanket
globs/directory excludes, so `generate-perf-fixture.ts` type-checks under the main
project config with its aliases available.

Fix applied and independently re-verified by the orchestrator (not just the agent's
self-report): `scripts/tsconfig.json` include narrowed to `["build-catalog.ts",
"catalogSchema.ts"]`; root `tsconfig.json` exclude narrowed to the same two explicit
files instead of the whole `scripts/` directory. `npx tsc --noEmit` and `npx tsc
--noEmit -p scripts/tsconfig.json` both pass clean. Ready to dispatch step 2a.

## Pre-P2 setup (complete)

- Confirmed P0 and P1 merged: PR #1 (`8d89ad8`), PR #2 (`d1dd26a`), both on
  `origin/main`.
- Local `main` fast-forwarded to `d1dd26a`.
- Stray uncommitted edit to the P1 state file (documenting its true final status,
  never committed before that branch was merged) stashed on
  `feat/p1-design-system` as `stale p1-state-file bookkeeping edit, phase already
  merged` - safe to drop later, not carried onto this branch since that phase's
  bookkeeping is closed.
- New feature branch `feat/p2-persistence-foundation` created off updated `main`.
- Read `docs/ROADMAP.md` P2 scope, `docs/ARCHITECTURE.md` sections 7 (full DDL) and
  8 (repository layer) in full, plus ADR-0002 (identifiers/timestamps/units/soft
  delete), ADR-0004 (repository contracts and sync-readiness), ADR-0011 (catalog
  build pipeline and bundled imagery), ADR-0014 (test seam and observability).
- Confirmed `docs/architecture-snapshot.md` does not need regenerating: only
  `CLAUDE.md`/`README.md` changed since the snapshot's recorded commit, not
  `docs/ARCHITECTURE.md`/`docs/ROADMAP.md`/`docs/adr/*` (checked via
  `git log <snapshot-commit>..HEAD -- CLAUDE.md README.md docs/ CONTRIBUTING.md`).
- Plan saved: `plans/2026-08-05-p2-persistence-foundation.md`.

## Per-agent dispatch status

| # | Agent | Status | Summary |
|---|-------|--------|---------|
| 1 | database-agent | done | schema.sql + 001_initial.ts (full ARCHITECTURE.md section 7 DDL, all 3 partial unique indexes - roadmap text says 2, section 7 defines 3, treated section 7 as authoritative), client.ts + ExpoSqlExecutor + 5 pragmas, repositories/contracts/database.ts + repository.ts (SqlExecutor/DatabaseContext/ReadRepository/WriteRepository verbatim per 8.2), migration runner + forward-version guard, NodeSqlExecutor on node:sqlite (not better-sqlite3 - zero native compile, CI already pins Node 24, verified FTS5/partial-index/rollback/RETURNING all work), muscle+equipment seed, idempotent versioned catalogSeeder, generate-perf-fixture.ts (2500 sessions/75000 sets, raw batched SQL), 11 test suites / 124 tests, full project 186 tests all passing in ~3.3s, tsc/eslint/prettier clean. Seed benchmark: 900 exercises in 47-150ms against a 2000ms budget. Flagged: repository.ts added beyond the literal ask (justified, needed by step 2a); ExpoSqlExecutor has no runtime test (expected per ADR-0014, Maestro covers it later); tsconfig collision with 2b's scripts/tsconfig.json (see Current step) - now being fixed by 2b. |
| 2a | backend-agent-sonnet | done | BaseSqliteRepository (id gen, audit stamping, injected-Clock local_date, generic soft delete/restore/purge, insertRow/updateRow template methods), repositories/mapping (case + bool/JSON codecs), repositories/query (parameterized WhereClause, whitelisted orderBy, clamped limit/offset), services/id (Uuid7IdGenerator, independent from database/ids), services/clock (SystemClock/FixedClock/computeLocalDate), services/kv (typed MmkvStore), services/files (ExpoFileStorage), services/logging (500-entry ring buffer + rolling file), services/container.ts (AppContainer/createContainer/ContainerProvider/useContainer - deliberately excludes feature repos and kv per its own header comment, extends incrementally per later phase), SettingsRepository (all 14 v1 keys, Zod-validated, default-fallback) placed at repositories/settings/ (new top-level sibling, reasoned placement documented - cross-cutting, doesn't fit ReadRepository/WriteRepository shape). 39 suites/303 tests passing in 3.9s (orchestrator independently re-ran and confirmed - was 27/186 before this step). tsc/eslint/prettier all clean (orchestrator independently re-verified: 0 errors, 1 pre-existing warning, pre-existing catalog.json formatting warning only). Flagged: added react-native-nitro-modules as a new dependency (react-native-mmkv v4's undeclared-but-required peer dep - without it any mmkv import throws at load time, including on-device; needs a pod install/prebuild before next device run) plus a Jest manual mock for it - needs security-agent audit + devsecops awareness for the native-rebuild step. |
| 2b | backend-agent-sonnet | done | Full pipeline built and run for real (not fixture-only): 873 exercises fetched from yuhonas/free-exercise-db, 1,746 images downscaled to 512px WebP via sharp, 1,721 unique files after content-hash dedup (25 duplicates caught, matching ADR-0011's estimate). exercises.catalog.json + empty exercises.pl.json/exercises.videos.json overlays emitted, Zod-validated, determinism verified (byte-identical output across two independent runs). tsc/eslint/prettier/jest(62 tests)/npm audit all clean. Exact CatalogExercise field shape (camelCase, mapping to ARCHITECTURE.md 7.4 columns) reported for the seeder to consume - see full report. Touched 3 files outside strict scope (tsconfig.json exclude, package.json/package-lock.json for sharp devDep + scripts/tsconfig.json for Node-ESM script target) - minimal, additive, justified, flagged for review. CATALOG_VERSION hardcoded "1". sharp added as new devDependency - needs step 5 security audit. |
| 3 | frontend-agent | done | app/dev/db-health.tsx (426 lines) - __DEV__-guarded per gallery.tsx precedent, calls getDatabaseDiagnostics(useContainer().db), shows schema version/last migration, file size, integrity_check, per-table row counts, SQLite version + compile options, FTS5/partial-index availability. Full a11y treatment (accessible groups, accessibilityLabel per row, announceForAccessibility on load/error/integrity-problem states). Reuses P1 primitives (Card, ListRow, Section, Badge, Skeleton, ErrorState) - no new components/ui additions. Was never formally reported in a prior session; orchestrator independently confirmed completeness against the plan's step 3 spec and re-ran the full verification gate (see below) before marking done. |
| 4 | test-agent | done | Created __tests__/database/benchmarks.perf.test.ts. Real assertions (schema/view/index-level, queryable today): previous-performance lookup (<50ms, measured 0-2ms), session detail load (<50ms, measured 0-1ms), one-year volume aggregation (<150ms, measured 2-12ms). test.skip'd with phase-naming comments: exercise search (needs ExerciseRepository FTS5 - lands P4), JSON export (needs export service - lands P9). Reviewed all of steps 1/2a's test coverage - no source-level gap found. Flagged (not fixed, not its file): __tests__/scripts/generate-perf-fixture.test.ts measured 27.6-28.8s under full parallel jest --ci against a 30s timeout - margin risk, not a coverage gap, left untouched since it's step 1's file. Orchestrator independently re-verified: tsc clean (both root and scripts/tsconfig.json), eslint 0 errors/1 pre-existing warning, jest --ci 40 suites/306 passed/2 skipped/0 failed in 13s. |
| 5 | security-agent-sonnet | done | reports/security-2026-08-05-p2.md written. react-native-nitro-modules: no CVEs, zero transitive deps, no install scripts, recognized maintainer (mrousavy). sharp: GHSA-f88m-g3jw-g9cj (libvips memory-safety CVEs) affects sharp < 0.35.0 - installed 0.35.3 already past the fix, and it's devDependency/build-time-only against a fixed versioned upstream source, never reaches the app bundle (confirmed via grep across app/, features/, services/, components/). npm audit --audit-level=high: 0 critical, 0 high (exit 0); 11 moderate findings are the pre-existing uuid/xcode/@expo-config-plugins chain, unrelated to either new package. Recommendation: approve as-is. Non-blocking notes: react-native-nitro-modules needs a pod install/prebuild before next device run (devsecops awareness item, carried from step 2a); session had NODE_TLS_REJECT_UNAUTHORIZED=0 set in the environment (not the repo) which weakens npm audit's TLS verification for this run - flagged as a methodology caveat, CI's audit:ci does not have that variable set so remains authoritative. |
| 6 | docs-agent | done | CLAUDE.md: Status section now lists P0+P1+P2 complete, notes /dev/db-health route. "Data layer" section rewritten from stale "not implemented, lands in P3" to full account of what P2 shipped. Fixed a factual error found along the way (Testing strategy said better-sqlite3, actually node:sqlite/NodeSqlExecutor). Added MMKV/nitro-modules prebuild note to Stack section. CHANGELOG.md: 10 new (P2)-tagged bullets under [Unreleased]/Added, matching existing convention. docs/ROADMAP.md: one-word fix, "two partial unique indexes" -> "three" (matches schema.sql's actual 3 indexes; ARCHITECTURE.md section 7 is authoritative per the plan, roadmap prose was stale). Orchestrator re-verified: tsc clean, eslint 0 errors/1 pre-existing warning. |
| 7 | git-commit-agent | done | 8 thematic commits, all pre-commit hooks (lint-staged, commitlint) clean: 9bd6ada (schema/migrations/executors/contracts), da1c0fd (chore: new deps), c501583 (base/mapping/query/settings repositories), e1636cd (services + container), 5b92f2d (catalog pipeline + 1721 webp assets), c1927b5 (dev db-health screen), d77d449 (persistence layer tests), f2d97ff (docs). Working tree clean after final commit. Orchestrator independently re-verified post-commit: tsc clean (root + scripts config), eslint 0 errors/0 warnings, jest --ci 40 suites/306 passed/2 skipped/0 failed. Nothing pushed. |

## Phase status

All 7 planned dispatch steps done and independently re-verified by the orchestrator.
Ready for Step 12 (push + PR) pending explicit user approval - not yet given.

## Files changed so far (this phase)

database/ (schema.sql, migrations, client.ts, diagnostics.ts), repositories/
(contracts, base, mapping, query, settings), services/ (id, clock, kv, files,
logging, container.ts), assets/data/exercises.*.json + assets/exercises/*.webp,
scripts/ (build-catalog.ts, generate-perf-fixture.ts, catalogSchema.ts,
tsconfig.json), app/dev/db-health.tsx, i18n/catalogs/en.ts (dbHealth.* keys),
package.json/package-lock.json (react-native-nitro-modules, sharp), tsconfig.json,
plus the full __tests__/database, __tests__/repositories, __tests__/services,
__tests__/scripts trees and __mocks__/. Nothing committed yet.

## Next action

Orchestrator independently re-verified the full project gate after confirming step
3 complete: `npx tsc --noEmit` clean, `npx eslint .` 0 errors / 1 pre-existing
warning, `npx jest --ci` 39 suites / 303 tests passing (19.7s). Dispatching step 4
(test-agent: benchmark suite skeleton) and step 5 (security-agent-sonnet:
dependency audit covering react-native-nitro-modules and sharp) in parallel, per
the plan - both depend only on already-completed steps. Step 6 (docs-agent) follows
once both report back; step 7 (git-commit-agent) after that.
