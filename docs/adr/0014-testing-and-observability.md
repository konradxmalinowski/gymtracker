# ADR-0014: Repository tests run in Node against real SQLite; crash reporting is opt-in

- Status: accepted
- Date: 2026-08-04
- Accepted: 2026-08-04. The stakeholder confirmed opt-in crash reporting with no external
  service enabled by default. Nothing in this ADR remains open.

## Context

Two problems that look unrelated but share a root cause: with no backend, the client is
the whole system. That means the repository layer *is* the backend and deserves backend-
grade testing, and it means there is no server-side telemetry to tell you when something
broke in production.

## Part 1: the test seam

`expo-sqlite` is a native module with no Node build. The default consequence is that any
test touching real SQL has to run on a simulator or device, which makes it slow enough
that it does not get written, which means the SQL - the part most likely to be wrong -
ends up untested.

### Options considered

**A. Mock the database in repository tests.**
Rejected outright. A mocked database proves that the repository calls the methods the
test author expected. It proves nothing about whether the SQL is correct, whether the
`CHECK` constraint fires, whether the partial unique index prevents two active workouts,
or whether the transaction rolls back. Those are exactly the properties this app's
correctness rests on.

**B. Run repository tests on-device via Detox or Maestro.**
Real fidelity, but a full app build per run and tens of seconds per test. Repository
tests need to run in seconds on every save, or they will not be run.

**C. Depend on a narrow `SqlExecutor` port and bind it to `better-sqlite3` (or Node 24's
built-in `node:sqlite`) in tests.** **Chosen.**

### Decision

Repositories depend on `SqlExecutor` (ARCHITECTURE.md section 8.2), never on
`expo-sqlite` directly:

```ts
export interface SqlExecutor {
  select<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
  selectOne<T>(sql: string, params?: SqlParam[]): Promise<T | null>;
  run(sql: string, params?: SqlParam[]): Promise<{ changes: number }>;
  batch(statements: ReadonlyArray<{ sql: string; params?: SqlParam[] }>): Promise<void>;
}
```

Two implementations: `ExpoSqlExecutor` on device, `NodeSqlExecutor` in tests. Tests
create an in-memory database, apply `database/schema.sql`, and exercise the real SQL -
the same strings, constraints, indexes and views that ship.

This is the highest-leverage abstraction in the codebase. It costs one interface and two
thin adapters, and it converts the untestable half of the app into a suite that runs in
under two seconds.

**Residual risk:** the SQLite version bundled with Expo and the one `better-sqlite3`
links against may differ in behavior. Mitigations: the app asserts its SQLite version
and the availability of FTS5 and partial indexes in a dev-only diagnostic on startup;
the Maestro flows exercise the same paths on a real device; and `schema.sql` uses no
version-fragile syntax beyond FTS5 and partial indexes, both of which have been stable
for years.

### Test distribution

| Layer | Tool | Expectation |
|-------|------|-------------|
| Domain calculators | Jest table-driven + `fast-check` for unit conversion round-trips and volume monotonicity | Near-total branch coverage. These rules corrupt history silently when wrong. |
| Repositories | Jest + `NodeSqlExecutor` | Every public method; every `CHECK`, `UNIQUE` and partial index asserted by a test that expects the violation |
| Migrations | Apply to empty DB and assert the result equals `schema.sql`; apply to a seeded fixture and assert no data loss | Every migration, permanently |
| Services | Jest with fake repositories | Transaction composition and error paths |
| Hooks | RNTL `renderHook` over a fake container | Query keys and invalidation |
| Components | RNTL behavioral tests; snapshots only for pure primitives | `SetRow`, `QuickAdjustBar`, `SwipeableRow`, `RestTimerBar` are mandatory |
| E2E | Maestro | The eight flows in ARCHITECTURE.md section 14.4 |

**Maestro over Detox** for E2E: Maestro needs no native test build, its YAML flows are
maintainable by one person, and it works against Expo dev clients and store builds
alike. Detox is more powerful and more deterministic for synchronization-heavy cases;
the extra power is not worth its setup and maintenance cost for eight flows.

One non-negotiable test: **E2E flow 4, the process-kill recovery test**, is the
acceptance criterion for FR-19 and blocks any release candidate.

**A test that exists purely to catch a specific structural risk:** the set-volume rules
from ADR-0006 are implemented twice - once in the `SetVolume` TypeScript calculator and
once in the `v_working_set` SQL view. A test generates a matrix of set types, weights and
rep counts, runs both implementations, and asserts they agree. Without it the two
definitions will drift and the workout screen will disagree with the statistics screen.

### Performance regression guard

A committed script (not a binary) generates a fixture database with 2,500 sessions and
75,000 sets. A benchmark suite asserts upper bounds on exercise search, previous-
performance lookup, session detail load, one-year volume aggregation and the JSON export.
These run on `NodeSqlExecutor` in CI, measuring SQL cost - the part that scales with the
user's history - rather than render cost.

## Part 2: observability without a server

### The tension

The brief says no cloud. A crash reporter is a cloud service. But an app published on
two stores, used by people the developer will never meet, with no server logs, is
maintained blind: a crash on a Samsung device running an OEM battery killer is invisible
until a one-star review mentions it.

### Options

**A. No crash reporting at all.** Purest reading of the brief. Store consoles do provide
some crash data (Play Console vitals, Xcode Organizer), but it is native stack traces
without JavaScript source mapping, which for a React Native app is often unactionable.

**B. Sentry, always on.** Standard practice, best diagnostics. Conflicts with the brief's
stance and forces a "data collected" declaration in both stores' privacy labels.

**C. Sentry, opt-in, default off, PII scrubbed.** **Chosen and confirmed by the
stakeholder: no external service is enabled by default.**

### Decision

`@sentry/react-native` via its Expo config plugin, wired but **disabled by default**.
Settings offers "Help improve the app by sending crash reports", off on first launch.
When off, the SDK is never initialized - not initialized-and-muted - so no network call
is possible.

When enabled: `sendDefaultPii: false`, no breadcrumbs from text inputs, and a
`beforeSend` hook that strips nickname, exercise notes, workout notes, body measurements
and photo paths from every event. Only stack traces, device model, OS version, app
version and route name leave the device.

Store declarations: "no data collected" while the default holds; the privacy policy
describes the opt-in path.

### What exists regardless of that decision

- `services/logging`: a 500-entry in-memory ring buffer plus an optional rolling file in
  the cache directory. Settings offers "Export diagnostics", which shares a redacted text
  file the user can inspect before sending anywhere.
- A dev-only database health screen: schema version, per-table row counts, file size,
  `PRAGMA integrity_check`, last migration applied, SQLite version and compile options.
- No repository error is ever silently swallowed on the workout screen; every failed
  write produces a toast and a log entry.

## Consequences

Positive: the SQL that the whole app's correctness depends on is covered by fast tests
that will actually be run; the crash-safety requirement has an executable acceptance
test; the observability stance is a decision with a default rather than an omission.

Negative: the `SqlExecutor` port means two executor implementations to maintain and a
small fidelity gap versus on-device SQLite. Opt-in crash reporting means most users will
never enable it, so real-world crash data will be sparse - accepted as the price of the
brief's privacy stance.
