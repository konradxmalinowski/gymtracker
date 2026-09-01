/**
 * Public barrel for the "body-metrics" feature.
 *
 * This is the ONLY surface other features may import from (ARCHITECTURE.md
 * section 3.1, rule 4 - enforced by the import/no-restricted-paths zones in
 * eslint.config.js). Reaching into "features/body-metrics/<subfolder>/..." from any
 * other feature is a lint error; import from "@/features/body-metrics" instead.
 *
 * P13 (docs/ROADMAP.md): the domain constants, DTO types, the two repository
 * *interfaces* (never `SqliteBodyMetricRepository`/`SqliteProgressPhotoRepository`
 * themselves - every existing feature barrel enforces this same "interface
 * only" rule), and the two services plus their dependency/input types and
 * error classes land here now. `body-metrics` stays a leaf per
 * ARCHITECTURE.md section 9.1's module dependency graph - no dependency on
 * `plans`, `workout-logging`, or `exercise-library`, and (as of this pass) no
 * other feature depends on it either.
 *
 * Hooks/screens/components are deliberately NOT exported here, unlike
 * `records`' barrel: `records`' hooks are barrel-exported because
 * `workout-logging` needs to cross-feature-import them (the one place this
 * codebase's "never barrel-export a screen, barrel-export a hook only when
 * another feature needs it" rule applies) - `body-metrics` has no such
 * cross-feature consumer, so its future hooks/screens (a later frontend-agent
 * pass) should stay out of this barrel, matching `plans`'/`workout-logging`'s
 * own precedent instead.
 */

export {
  BODY_METRIC_TYPES,
  metricUnit,
  type BodyMetricType,
  type MetricUnit,
} from './domain/metrics';

export type { BodyMetricEntry, LatestMetricValue } from './types/BodyMetric';
export type { PhotoPose, ProgressPhoto } from './types/ProgressPhoto';

export type {
  BodyMetricRepository,
  CreateBodyMetricEntryInput,
  UpdateBodyMetricEntryPatch,
} from './repository/BodyMetricRepository';

export type {
  CreateProgressPhotoInput,
  ListProgressPhotosOptions,
  ProgressPhotoIntegrityReport,
  ProgressPhotoRepository,
  UpdateProgressPhotoPatch,
} from './repository/ProgressPhotoRepository';

export {
  BodyMetricService,
  BODY_METRIC_NOTE_MAX_LENGTH,
  type BodyMetricServiceDependencies,
  type RecordBodyMetricEntryInput,
  type UpdateBodyMetricEntryInput,
} from './services/BodyMetricService';

export {
  ProgressPhotoService,
  PROGRESS_PHOTO_DIRECTORY,
  PHOTO_NOTE_MAX_LENGTH,
  type AddProgressPhotoInput,
  type ProgressPhotoServiceDependencies,
  type UpdateProgressPhotoInput,
} from './services/ProgressPhotoService';

export { BodyMetricValidationError, ProgressPhotoValidationError } from './services/errors';
