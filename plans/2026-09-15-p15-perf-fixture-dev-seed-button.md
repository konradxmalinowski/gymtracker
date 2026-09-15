# P15 - on-device performance fixture seed button

## Task

Add a `__DEV__`-gated button to `/dev/db-health` that seeds a long-history
performance fixture directly into the app's real, live on-device SQLite
database, so FlashList scroll performance on `WorkoutHistoryListScreen` and
`PersonalRecordsScreen` can be manually verified against realistic data
volume on the `gymtracker_test` Android emulator. Temporary verification
tooling for this phase, not a shipped feature - orchestrator decides after
the on-device pass whether to keep, revert, or leave it.

## Acceptance criteria

- Button lives on `/dev/db-health`, same `__DEV__`-guard pattern as the rest
  of the screen.
- Reuses `generatePerfFixture()` from `scripts/generate-perf-fixture.ts`
  as-is - no rewritten/duplicated generation logic.
- Shows a busy state while seeding runs and a completion toast with actual
  row counts, using `components/feedback`/`stores/toastStore`.
- Never touches `exercise_user_data`. Read `generatePerfFixture()` fully
  first to confirm what it does and does not touch, and report any
  discrepancy with "only workout_session/session_exercise/workout_set"
  rather than silently accepting or silently fixing it.
- No new npm dependency, no new/changed test files.

## Components to create or modify

- `app/dev/db-health.tsx` - new `PerfFixtureSection` component + wiring.
- `scripts/generate-perf-fixture.ts` - investigate only; touch only if the
  existing Node-only `main()`/dynamic `node:sqlite` import turns out to be
  unsafe to have in the same module Metro must resolve for the RN bundle.
- `i18n/catalogs/en.ts` - new `dbHealth.perfFixture*` keys.

## State / data flow

Local component state (idle/running/success/error) inside a new
`PerfFixtureSection`, mirroring the existing `PhotoIntegritySection`
pattern already on this screen. On success, re-triggers the screen's
existing diagnostics reload (`handleRetry`) so the Tables section shows the
new row counts without a manual pull-to-refresh.

## Fixture size

Full CI fixture is 2,500 sessions / 75,000 sets - likely impractically slow
for a one-off on-device tap via `expo-sqlite`'s JS<->native bridge (tens of
thousands of sequential single-row `run()` calls). Chosen dev size:
500 sessions x 5 exercises x 6 sets = 15,000 sets - still "long-history"
enough to stress FlashList (far beyond any real user's history) while
keeping on-device generation time reasonable.

## Accessibility

Button follows the existing `Button` component's built-in
`accessibilityRole="button"`/`accessibilityState.busy` handling - no new
accessibility surface needed.

## Error handling

Any thrown error from `generatePerfFixture()` is caught, logged via
`container.logging.error`, and surfaced as an error toast - matching how
every other action on this screen (and `DataExportScreen`) handles
failures.

## Edge cases

- Repeated taps: fixture generation is purely additive (random UUIDv7 ids
  each run) - never overwrites or deletes existing rows, so re-tapping is
  safe, just adds more rows.
- Button disabled while a run is already in progress (loading state already
  disables `Button` via its own `disabled || loading` logic).
