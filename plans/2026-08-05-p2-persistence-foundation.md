# P2 - Persistence foundation

## Problem summary

P0 (project foundation) and P1 (design system and UI primitives) are complete and
merged (`origin/main` @ `d1dd26a`). Per `docs/ROADMAP.md`, P2 is the database,
repository infrastructure and seeded exercise catalog. No feature screens. This is
flagged by the roadmap's own risk register as the largest single phase, kept whole
deliberately rather than split into multiple commits/PRs, because a half-built
schema is not shippable and because splitting it means migrating a schema no user
has yet.

## Acceptance criteria (from docs/ROADMAP.md P2)

- Fresh install seeds ~900 exercises with muscles, equipment, images and the FTS
  index in under 2 seconds behind the splash screen, with every image resolving
  from the bundle and no network request made at any point (D-01).
- Re-running the seeder with an unchanged `catalog.version` is a no-op.
- Re-running it with a bumped version updates catalog rows and leaves
  `exercise_user_data` untouched (asserted by a test).
- Every table, constraint, partial index and view in ARCHITECTURE.md section 7
  exists and has a test asserting its behavior, including the two partial unique
  indexes (`ux_plan_single_active`, `ux_session_single_in_progress`, `ux_pr_current`
  - three partial unique indexes total, roadmap text says "two", ARCHITECTURE.md
  section 7 defines three; treating ARCHITECTURE.md section 7 as authoritative
  since it is the primary source and the roadmap text is a summary).
- Repository tests run in Node in under 2 seconds.
- The benchmark suite runs in CI and reports baseline numbers.

Commit message (fixed by the roadmap): `feat: add sqlite persistence layer with
migrations, repositories and exercise catalog seed`

## Task shape and scale

Single application (GymTracker), one phase, multiple layers (database schema,
TypeScript repository/service infrastructure, a build-time data pipeline script, one
dev-only diagnostic screen, a test/benchmark harness). Not a multi-app task. Steps
6-10 run once against the whole phase, not per-subtask, consistent with how P0 and
P1 were run (one commit, one review pass, one parallel verification round at the
end).

## Platform

React Native / Expo (cross-platform mobile), already established in P0/P1. No web
surface exists in this project - Step 9b (SEO) and the crawler portion of Step 9d
(LLM accessibility) do not apply and are skipped. Step 9e (accessibility) does not
apply either: this phase adds no user-reachable screens (the DB health screen is
`__DEV__`-only, following the P1 `/dev/gallery` precedent, not shipped UI) - noted
explicitly rather than silently skipped.

## Affected layers

Database (schema, migrations, seed), backend/infrastructure (repositories, services,
DI container), a build tool (catalog pipeline script), a dev-only frontend screen,
tests (repository + domain + benchmark).

## Step-by-step implementation sequence

1. **database-agent** - the DB layer foundation (sequenced first; everything else in
   this phase depends on its output):
   - `database/client.ts`: `openDatabase`, the five pragmas from ARCHITECTURE.md
     7.1 (`journal_mode=WAL`, `synchronous=FULL`, `foreign_keys=ON`,
     `busy_timeout=5000`, `temp_store=MEMORY`), `ExpoSqlExecutor`.
   - `repositories/contracts/database.ts`: `SqlExecutor` and `DatabaseContext`
     interfaces exactly per ARCHITECTURE.md 8.2 (this is the seam the rest of the
     phase is built on - ADR-0014 calls it "the highest-leverage abstraction in the
     codebase").
   - `database/schema.sql` and `database/migrations/001_initial.ts`: the complete
     DDL from ARCHITECTURE.md section 7 in one migration - every table (7.3-7.8),
     the `exercise_fts` virtual table (7.4), every index (7.9), every view (7.10).
   - Migration runner over `PRAGMA user_version` plus `migration_history`
     (7.2), and the forward-version guard screen from ARCHITECTURE.md 15.1 (read
     that section before implementing - not quoted here since it was not part of
     this phase's required reading list, agent must read it directly).
   - `NodeSqlExecutor` (better-sqlite3-backed) and the Jest harness applying
     `schema.sql` to an in-memory DB, per ADR-0014 part 1 - this is what makes every
     later repository test run in Node in under 2 seconds.
   - `database/seed`: `muscle` and `equipment` lookup seed data, and the idempotent,
     versioned `catalogSeeder` per ADR-0011 decision 1 (compares bundled
     `catalogVersion` against the `catalog.version` app setting, upserts by
     `catalog_slug` inside one transaction touching only `source = 'catalog'` rows,
     rebuilds FTS). Seeder consumes `assets/data/exercises.catalog.json`, produced
     by step 3 below - stub/fixture data is acceptable for step 1's own tests, do
     not block on step 3.
   - The performance fixture generator script (2,500 sessions / 75,000 sets) per
     ADR-0014's "performance regression guard" - raw batched SQL against the schema,
     not through the repository layer, for insert speed at that row count.
   - Repository/migration tests: every table/constraint/partial index/view from
     section 7 asserted, migrations applied to an empty DB and asserted equal to
     `schema.sql`, re-seed idempotency (unchanged version = no-op; bumped version
     updates catalog rows and leaves `exercise_user_data` untouched).
   - Owned files: `database/**`, `repositories/contracts/**`, `scripts/generate-
     fixture.ts` (or equivalent name - agent's call), plus their tests.

2. **backend-agent-sonnet**, two parallel instances (disjoint file sets, both consume
   step 1's `SqlExecutor`/`DatabaseContext` contract, sequenced after step 1):

   - **2a - repository/service infrastructure**:
     - `repositories/base`: `BaseSqliteRepository` (id generation via the UUIDv7
       service, audit columns, `local_date` computation, soft-delete filtering per
       ADR-0002 decision 4), `repositories/mapping` codecs, `repositories/query`
       builder.
     - `services/id` (UUIDv7 generator), `services/clock`, `services/kv` (typed
       MMKV wrapper), `services/files` (`FileStorage`), `services/logging` (the
       500-entry ring buffer plus optional rolling file, per ADR-0014 part 2 - this
       exists regardless of the crash-reporting decision, which is out of scope
       for P2, wired in P0/P15 per the roadmap's decision table).
     - `services/container.ts` composition root and `ContainerProvider`, per
       ARCHITECTURE.md 8.4 - `AppContainer` shape as specified there, but only the
       members this phase actually builds (`db`, `settings`, `files`, `clock`,
       `idGenerator`; the feature repositories - `exercises`, `plans`, `sessions`,
       etc. - do not exist until their own phases, so the interface must not
       declare members nothing implements yet; extend the container interface
       incrementally in each later phase instead of pre-declaring empty slots now,
       consistent with the brief's "never create placeholder code" rule that ADR-
       0004 leans on).
     - `SettingsRepository` with the typed key registry (`SETTINGS_SCHEMA`) and
       Zod-validated defaults, covering the known keys list in ARCHITECTURE.md 7.3.
     - Owned files: `repositories/base/**`, `repositories/mapping/**`,
       `repositories/query/**`, `services/id/**`, `services/clock/**`,
       `services/kv/**`, `services/files/**`, `services/logging/**`,
       `services/container.ts`, `services/SettingsRepository.ts` (or wherever the
       agent places it per the folder-structure convention - `features/profile` is
       not the right owner since settings has no dedicated feature directory in the
       section 9 tree; agent confirms placement against ARCHITECTURE.md section 9
       before writing).

   - **2b - catalog build pipeline**:
     - `scripts/build-catalog.ts` per ADR-0011 decision 1: fetch and normalize the
       Free Exercise DB, map muscles/equipment to lookup slugs, compute
       diacritic-folded `name_search`, downscale all imagery to 512px WebP quality
       70 per ADR-0011 decision 2 (D-01 - full bundling, no lazy network path),
       write to `assets/exercises/`, emit `assets/data/exercises.catalog.json` plus
       the empty overlay files (`exercises.pl.json`, `exercises.videos.json` per
       ADR-0011 decision 3), validate output against a Zod schema (CI must fail on
       a broken regeneration, not ship bad data).
     - This step only depends on the target JSON/DB shape from ARCHITECTURE.md
       section 7.4, not on step 1's actual implementation being finished - can start
       immediately in parallel with step 1, not just after it. Flagged here as
       running in parallel from the start, not sequenced behind step 1, since file
       sets are fully disjoint (`scripts/build-catalog.ts`, `assets/data/**`,
       `assets/exercises/**` vs. `database/**`).
     - Owned files: `scripts/build-catalog.ts`, `assets/data/**`,
       `assets/exercises/**`.

3. **frontend-agent** (sequenced after 2a - needs a working `ContainerProvider` and
   `SettingsRepository`/db diagnostics to render against):
   - The dev-only database health screen per ADR-0014 part 2: schema version,
     per-table row counts, file size, `PRAGMA integrity_check`, last migration
     applied, SQLite version and compile options, plus the FTS5/partial-index
     availability assertion from ADR-0014's "residual risk" note.
   - Follows the P1 precedent: `__DEV__`-guarded, reachable only in development,
     same pattern as `app/dev/gallery.tsx`.
   - Owned files: `app/dev/db-health.tsx` (or equivalent name), any small
     presentational pieces it needs that do not belong in `components/ui` (reuse
     existing P1 primitives - `Card`, `ListRow`, `StatTile`, `Section` - rather than
     inventing new ones).

4. **test-agent** (sequenced after 1 and 2a - needs the fixture generator and the
   repository layer both in place):
   - The CI benchmark suite itself (as opposed to the fixture-generation script from
     step 1): asserts upper bounds on exercise search, previous-performance lookup,
     session detail load, one-year volume aggregation, and JSON export, run against
     `NodeSqlExecutor` per ADR-0014's "performance regression guard" section. Most
     of these queries do not exist yet as repository methods until later phases
     (P4 exercise search, P9 export) - this step builds the *skeleton*
     (fixture-backed `NodeSqlExecutor` setup, timing harness, baseline-recording
     assertions) against what P2 actually ships (schema/views/seed), and stubs the
     remaining benchmark cases as explicitly-skipped (`test.skip` with a comment
     naming the phase that fills it in), not as silent gaps or fake passing
     assertions - roadmap P2's own acceptance line only requires "the benchmark
     suite runs in CI and reports baseline numbers," which the schema/view-level
     benchmarks (view aggregation, seed timing) can already satisfy.
   - Any additional domain/repository test coverage step 1/2a's own agents did not
     already write for their own code (test-agent verifies coverage, does not
     duplicate what database-agent/backend-agent-sonnet already wrote and
     self-verified).

## API contracts

No HTTP API in this phase (offline app, no backend). The load-bearing contract is
`SqlExecutor`/`DatabaseContext` (ARCHITECTURE.md 8.2), fixed before step 2 starts,
plus the `WriteRepository`/`ReadRepository` shapes (8.2) that `BaseSqliteRepository`
must satisfy for every later feature repository.

## Error handling strategy

- Repository writes: no error is ever silently swallowed (ADR-0014 part 2) - every
  failed write must be observable (this phase's own tests assert failures surface,
  not swallow; the actual toast wiring is a feature-phase concern since there is no
  screen yet in P2).
- Migration runner: a migration failing partway must not leave `PRAGMA user_version`
  bumped past a migration that did not fully apply - each migration runs inside its
  own transaction (ARCHITECTURE.md 7.2).
- Catalog seeder: idempotency and version-gating are the error-handling story here -
  a crash mid-seed on first launch must be safely retryable (the seeder's transaction
  boundary is the same "one transaction" ADR-0011 specifies).
- `build-catalog.ts`: Zod validation of its own output is the safety net - a schema
  mismatch fails the script/CI rather than emitting bad JSON that seeds silently
  wrong data.

## Edge cases to address

- Fresh install with no prior `user_version` (0) applies migration 001 cleanly.
- Re-running the catalog seeder with an unchanged version is a true no-op (no
  writes, not just no visible change).
- Re-running with a bumped version updates catalog rows (`source='catalog'`) and
  provably does not touch `exercise_user_data` rows (favorites/notes survive).
- `NodeSqlExecutor` and `ExpoSqlExecutor` must agree on FTS5/partial-index behavior
  - the ADR-0014 residual-risk assertion covers exactly this gap; the dev DB health
    screen surfaces the same check at runtime.
- The two/three partial unique indexes must be proven to reject a second row via a
  test that expects the constraint violation, not just proven to exist.
- `build-catalog.ts` re-run against unchanged upstream data must be a stable diff
  (no spurious churn in `exercises.catalog.json` from non-deterministic ordering or
  timestamps), since the file is committed and reviewed with `--stat`.

## Dependencies

New packages expected (subject to what each agent actually needs and reports):
`better-sqlite3` (dev dependency, Node test executor), an image-processing library
for the WebP downscale step in `build-catalog.ts` (e.g. `sharp` - agent's choice,
flagged to security-agent-sonnet for the dependency audit either way), `zod`
(already a stack dependency per CLAUDE.md). No new external services - this phase
is entirely offline/build-time.

## Feature-flag decision

Not applicable - CLAUDE.md and the P0/P1 history show no feature-flag system in this
project, so this is not raised further per the workflow's own rule.

## NFR decisions

- Seed time budget: under 2 seconds behind the splash screen for ~900 exercises
  (roadmap acceptance criterion) - achieved via one transaction and prepared
  statements per ADR-0011, verified by a benchmark, not just asserted informally.
- Repository test suite: under 2 seconds in Node (ADR-0014) - verified by CI timing,
  not just "should be fast."
- No other non-trivial NFRs (load/latency/uptime/compliance) apply - this is an
  offline, single-user, local-only phase.

## Agent delegation plan (summary)

| # | Agent | Scope | Runs |
|---|-------|-------|------|
| 1 | database-agent | schema, migrations, client, SqlExecutor contract + Node/Expo executors, seed infra + catalogSeeder, fixture generator, DB-level tests | first |
| 2a | backend-agent-sonnet | repository base infra, services (id/clock/kv/files/logging), container, SettingsRepository | parallel with 2b, after 1 |
| 2b | backend-agent-sonnet | scripts/build-catalog.ts, catalog JSON + bundled imagery | parallel with 2a, parallel with 1 (no dependency on 1's output) |
| 3 | frontend-agent | dev-only DB health screen | after 2a |
| 4 | test-agent | benchmark suite skeleton, any residual coverage gaps | after 1 and 2a |
| 5 | security-agent-sonnet | dependency audit for new packages (better-sqlite3, image lib) | after 2b (once deps are known), parallel with 3/4 |
| 6 | docs-agent | CLAUDE.md status update, CHANGELOG entry | after 1-5 all done |
| 7 | git-commit-agent | single commit per roadmap's stated convention | after docs-agent |

No accessibility-agent, seo-agent, or llm-accessibility-agent dispatch this phase -
no user-reachable UI or web surface is added (see Platform section above).

Step 12 (push + PR) requires explicit stakeholder approval and is never automatic,
same as P0 and P1 - this plan stops at presenting the summary for approval.
