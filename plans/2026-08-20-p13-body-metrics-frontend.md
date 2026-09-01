# P13 body-metrics: frontend layer (hooks/screens/navigation/i18n)

Full brief already specified in detail by the orchestrator dispatch (frontend-agent
picking up the presentation half of P13 after backend-agent's domain/repository/
service/composition-root pass, already on disk and untouched by this pass). This file
is the condensed lifecycle record; the authoritative spec is the dispatch prompt
itself.

## Task

Everything presentation-layer for "Body measurements and progress photos":
hooks (`features/body-metrics/hooks/`), screens (`features/body-metrics/screens/`),
sheet content/grid-cell components (`features/body-metrics/components/`), navigation
wiring (`navigation/routes.ts`, `app/body-metrics/**`), the `ProfileScreen` entry
point, `app/dev/db-health.tsx`'s photo-integrity section, and every new i18n string.

## Judgment calls (decided here, reported back at the end)

- **Metric picker scope**: quick-entry sheet is always opened with a metric already
  fixed (a per-row "+" on `MeasurementsListScreen`, or the header "+" on
  `MetricHistoryScreen`) - no in-sheet metric picker. Simpler, still satisfies
  "quick-entry modal," and matches the list screen's own per-metric row shape.
- **FlashList**: `MetricHistoryScreen`'s entry list uses a plain mapped `Column`
  (bounded, realistically well under 30 rows per metric). `PhotoGridScreen` uses
  `FlashList` with `numColumns` - real photo counts exceed the threshold.
- **Photo pagination**: `ProgressPhotoRepository.listAll`'s default `Pagination`
  clamp is 20/page (`repositories/query/OrderAndPage.ts`), not unbounded - so
  `usePhotoList` is a real `useInfiniteQuery`, mirroring `useSessionHistoryList`'s
  exact shape (`onEndReached` + `getNextPageParam`), not a single unbounded fetch.
- **Compare-mode interaction**: a "Compare" toggle button on `PhotoGridScreen` enters
  a selection mode; tapping exactly 2 cells enables a "Compare" action that navigates
  to `PhotoCompareScreen` with both ids as route params.
- **Root-level vs profile-nested route shape**: `app/body-metrics/_layout.tsx`, a
  dedicated root-level Stack (same shape as `app/(tabs)/exercises/_layout.tsx`, just
  outside `(tabs)`) - 5 screens (list, per-metric history, photo grid, photo detail,
  compare) is materially more than `history`/`calendar`'s single-screen entry points,
  so one shared Stack with consistent header chrome is the right shape, reached via
  `routes.bodyMetrics.list()` from a new `ProfileScreen` row exactly like
  `profile.records`/`profile.history`/`profile.calendar`.
- **Cross-feature imports**: none. `formatAchievedDate` lives in `records` and is
  barrel-exported, but body-metrics' own barrel declares itself a leaf with "no other
  feature depends on it either" - importing `records` here would be the first
  incoming edge that comment explicitly rules out. A small local date formatter is
  duplicated instead (the same "duplicate, don't import" precedent `statistics`'
  `localDate.ts` already set against `home`).
- **Units**: `useUnitsSettings()` (`features/profile/hooks/useSettings.ts`) already
  reads both `units.weight`/`units.length` together - reused directly, no new
  settings hook.

## Files to create

- `features/body-metrics/hooks/{queryKeys,invalidation,metricUnits,useBodyMetrics,usePhotos}.ts`
- `features/body-metrics/components/{metricPresentation,formatBodyMetricsDate}.ts`
- `features/body-metrics/components/{MeasurementQuickEntrySheetContent,PhotoSourceSheetContent,PhotoGridCell}.tsx`
- `features/body-metrics/screens/{MeasurementsListScreen,MetricHistoryScreen,PhotoGridScreen,PhotoDetailScreen,PhotoCompareScreen}.tsx`
- `app/body-metrics/_layout.tsx`, `app/body-metrics/index.tsx`, `app/body-metrics/[metric].tsx`,
  `app/body-metrics/photos/index.tsx`, `app/body-metrics/photos/[photoId].tsx`,
  `app/body-metrics/photos/compare.tsx`

## Files to modify

- `navigation/routes.ts` (additive `bodyMetrics` group)
- `features/profile/screens/ProfileScreen.tsx` (additive `ListRow`)
- `app/dev/db-health.tsx` (additive photo-integrity `Section`)
- `i18n/catalogs/en.ts` (additive `bodyMetrics:` top-level key + `dbHealth.photoIntegrity*`)

## Error handling strategy

- Every screen: pending skeleton / error state with retry / real per-item empty state,
  per CLAUDE.md's "three required states" rule.
- `MeasurementQuickEntrySheetContent`: inline Zod-issue display from
  `BodyMetricValidationError`, mirroring `PlanNameSheetContent`'s try/catch shape.
- Photo grid/detail/compare: a missing file on disk (`Image.onError`) renders a
  placeholder icon, never an infinite spinner - a per-cell `useState` error flag.
- Permanent photo delete: `ConfirmDialog`, explicit irreversibility copy matching
  `WorkoutHistoryDetailScreen`'s established tone.

## Edge cases

- A metric with zero entries still renders on the list screen (merge
  `listLatestValues()` against the full `BODY_METRIC_TYPES` list).
- Rapid double-tap on quick-entry save / permanent-delete confirm - `Button`'s own
  `loading`/`disabled` props guard both, same precedent every other mutation-gated
  button in this codebase uses.
- Soft-delete + undo toast for both metric entries and photos (mutation hooks stay
  simple `delete`/`restore` pairs; the toast + "Undo" action lives at the screen call
  site, matching `PlanDetailScreen.handleDeleteDay`'s exact shape - not inside the hook).

## Verification plan

`npx tsc --noEmit` and a targeted `npx eslint` on new/changed files. No emulator run
(no device available to this agent in this environment) - Phase C's on-device QA
sweep (already scoped in the parent plan) picks this feature up once it lands. No
tests written (test-agent's pass, per explicit instruction). No commit (a separate
step handles that).
