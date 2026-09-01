# P13 body-metrics: backend layer (domain/repository/service/composition-root)

Full brief already specified in detail by the orchestrator dispatch (fullstack-orchestrator
delegating the backend half of P13 to backend-agent). This file is the backend-agent's own
condensed lifecycle record; the authoritative spec is the dispatch prompt itself.

## Task

Implement the non-UI half of P13 "Body measurements and progress photos":
- `services/files/FileStorage.ts` / `ExpoFileStorage.ts`: additive `list()` method.
- `services/images/` - new `ImageProcessor` abstraction over `expo-image-manipulator`
  (newly installed, `~57.0.12`).
- `features/body-metrics/domain/metrics.ts` - pure metric-type/unit constants.
- `features/body-metrics/types/` - `BodyMetricEntry`/`LatestMetricValue`/`ProgressPhoto` DTOs.
- `features/body-metrics/repository/{BodyMetricRepository,SqliteBodyMetricRepository}.ts`
  and `{ProgressPhotoRepository,SqliteProgressPhotoRepository}.ts`, both extending
  `BaseSqliteRepository`.
- `features/body-metrics/services/{BodyMetricService,ProgressPhotoService,errors}.ts`,
  Zod-validated, the only door into the two repositories.
- `features/body-metrics/index.ts` barrel (no hooks/screens exported).
- `services/container.ts` wiring - additive only.

No migration (schema already exists from P2). No tests (test-agent's job). No hooks/
screens/components (frontend-agent's job, next pass). No touching workout-logging/
records/plans/exercise-library.

## Files to create

- `services/images/ImageProcessor.ts`, `services/images/ExpoImageProcessor.ts`,
  `services/images/index.ts`
- `features/body-metrics/domain/metrics.ts`
- `features/body-metrics/types/BodyMetric.ts`, `features/body-metrics/types/ProgressPhoto.ts`
- `features/body-metrics/repository/BodyMetricRepository.ts`,
  `features/body-metrics/repository/SqliteBodyMetricRepository.ts`
- `features/body-metrics/repository/ProgressPhotoRepository.ts`,
  `features/body-metrics/repository/SqliteProgressPhotoRepository.ts`
- `features/body-metrics/services/errors.ts`,
  `features/body-metrics/services/BodyMetricService.ts`,
  `features/body-metrics/services/ProgressPhotoService.ts`
- `features/body-metrics/index.ts` (replace placeholder)

## Files to modify

- `services/files/FileStorage.ts`, `services/files/ExpoFileStorage.ts` (additive `list()`)
- `services/container.ts` (additive members)
- `package.json`/`package-lock.json` (via `npx expo install expo-image-manipulator`, done)

## Error handling strategy

- Repository layer: parameterized SQL throughout, `RepositoryNotFoundError` via base
  class mechanics, no new error types needed at that layer.
- Service layer: Zod validation throws `BodyMetricValidationError`/
  `ProgressPhotoValidationError` carrying `.issues`.
- `ProgressPhotoService.addPhoto`: write-then-commit (ADR-0012) - file write failures
  throw before any DB row is created; explicit size-verification throw, no swallowing.
- `permanentlyDeletePhoto`: throws if id not found at all (via `findByIdIncludingDeleted`).

## Edge cases

- `verifyIntegrity()`: orphan files vs. dangling live rows, soft-deleted rows excluded
  from "dangling" (expected to reference a file until purge).
- `value` validation rejects non-finite/zero/negative (no CHECK constraint backs this,
  same reasoning as `PlanService.restSecondsSchema`).
- `listByMetric` unbounded when no `options` given (small per-metric history), paginated
  via `buildLimitOffset` otherwise.

## Verification plan

`npx tsc --noEmit` and targeted `npx eslint` on new/changed files. No `__tests__/**`
additions (test-agent's pass). No dev-server/emulator run needed for this backend-only
slice - no route/screen exists yet to exercise it against; Phase C's on-device sweep
picks this up once frontend-agent wires the UI in the next pass.
