import type { EntityId } from '@/repositories/contracts/repository';
import type {
  ExerciseForce,
  ExerciseLevel,
  ExerciseMechanic,
  ExerciseMuscleRef,
  ExerciseTrackingType,
} from '@/features/exercise-library';
import type { ProfileSex } from '@/features/profile';
import type { SessionStatus, SetType } from '@/features/workout-logging';
import type { RecordType } from '@/features/records';
import type { BodyMetricType, PhotoPose } from '@/features/body-metrics';

/**
 * The JSON backup envelope - ADR-0013's authoritative shape, reproduced here
 * as camelCase TS interfaces. Every field name below is a direct camelCase
 * transcription of a `database/schema.sql` column; see each interface's own
 * comment for the table it mirrors. Ids are always preserved verbatim from
 * the source row (ADR-0013: "That is what makes merge mode idempotent").
 *
 * **Fidelity decision (judgment call, not spelled out in the ADR):** every
 * entity below carries `deletedAt`, and export reads are NOT filtered by
 * `deleted_at IS NULL` (unlike almost every other read in this codebase).
 * ADR-0013 states merge import must propagate a soft-delete ("Soft-deleted
 * rows in the file soft-delete their local counterparts") - that is only
 * possible if a soft-deleted row is present in the file at all. A JSON
 * backup is the app's *only* recovery mechanism (NFR-06); silently dropping
 * soft-deleted rows would make that propagation promise false. Catalog
 * exercises are the one deliberate exception (never exported, regardless of
 * `deleted_at`, per ADR-0013's "Catalog exercises are not exported").
 */

/** `user_profile` (`database/schema.sql` section 7.3). No `deletedAt` - the table has none (a fixed singleton row). */
export interface ExportProfile {
  nickname: string;
  avatarFileName: string | null;
  birthDate: string | null;
  sex: ProfileSex | null;
  createdAt: number;
  updatedAt: number;
}

/** One `app_setting` row. `value` is whatever JSON scalar/object the key holds - re-validated per-key by the settings layer at import time, not here. */
export interface ExportSetting {
  key: string;
  value: unknown;
  updatedAt: number;
}

/**
 * One `exercise` row with `source = 'custom'`, its `exercise_muscle` rows
 * embedded as `muscles` - mirrors `database/seed/catalogSeeder.ts`'s
 * `CatalogExerciseEntry.muscles` shape exactly (same `{slug, role}` pair) so
 * an importer can reuse that same insert pattern. Catalog exercises
 * (`source = 'catalog'`) are never exported (ADR-0013) - they ship with the
 * binary and are re-derived from `catalog_slug` on the importing device.
 */
export interface ExportCustomExercise {
  id: EntityId;
  nameEn: string;
  namePl: string | null;
  nameSearch: string;
  aliases: string[];
  category: string | null;
  force: ExerciseForce | null;
  mechanic: ExerciseMechanic | null;
  level: ExerciseLevel | null;
  equipmentSlug: string | null;
  bodyPart: string | null;
  trackingType: ExerciseTrackingType;
  instructions: string[];
  images: string[];
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  muscles: ExerciseMuscleRef[];
}

/**
 * One `exercise_user_data` row (favorites, notes, per-exercise rest
 * overrides) - exported regardless of whether `exerciseId` points at a
 * catalog or custom exercise (a user can favorite a catalog exercise), which
 * is why replace-mode purge wipes this table wholesale rather than scoping it
 * to custom exercises the way it scopes `exercise`/`exercise_muscle`. No
 * `deletedAt` - the table has none (ARCHITECTURE.md section 7.4).
 */
export interface ExportExerciseUserData {
  exerciseId: EntityId;
  isFavorite: boolean;
  favoritedAt: number | null;
  note: string | null;
  defaultRestSeconds: number | null;
  displayNameOverride: string | null;
  lastPerformedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/** One `exercise_video` row with `source = 'user'` only - curated catalog videos are never exported, same reasoning as catalog exercises. */
export interface ExportExerciseVideo {
  id: EntityId;
  exerciseId: EntityId;
  url: string;
  title: string;
  channel: string | null;
  language: 'en' | 'pl';
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

/** One `plan_day_exercise` row. */
export interface ExportPlanDayExercise {
  id: EntityId;
  exerciseId: EntityId;
  sortOrder: number;
  targetSets: number | null;
  targetRepMin: number | null;
  targetRepMax: number | null;
  targetRpe: number | null;
  restSeconds: number | null;
  supersetGroup: number | null;
  note: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

/** One `plan_day` row, its `plan_day_exercise` rows embedded as `exercises`. */
export interface ExportPlanDay {
  id: EntityId;
  name: string;
  note: string | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  exercises: ExportPlanDayExercise[];
}

/** One `plan` row, its `plan_day` rows embedded as `days` (ADR-0013: "matches the aggregate boundaries from ADR-0004 so import can transact per aggregate"). */
export interface ExportPlan {
  id: EntityId;
  name: string;
  description: string | null;
  color: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  days: ExportPlanDay[];
}

/** One `workout_set` row, including drop segments (`parentSetId` non-null). */
export interface ExportWorkoutSet {
  id: EntityId;
  setIndex: number;
  setType: SetType;
  parentSetId: EntityId | null;
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceM: number | null;
  rpe: number | null;
  isCompleted: boolean;
  completedAt: number | null;
  performedAt: number;
  note: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

/** One `session_exercise` row, its `workout_set` rows embedded as `sets`. */
export interface ExportSessionExercise {
  id: EntityId;
  exerciseId: EntityId;
  exerciseNameSnapshot: string;
  sortOrder: number;
  supersetGroup: number | null;
  restSecondsOverride: number | null;
  note: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  sets: ExportWorkoutSet[];
}

/** One `workout_session` row, its `session_exercise` rows embedded as `exercises`. */
export interface ExportSession {
  id: EntityId;
  planId: EntityId | null;
  planDayId: EntityId | null;
  planNameSnapshot: string | null;
  planDayNameSnapshot: string | null;
  title: string;
  status: SessionStatus;
  startedAt: number;
  finishedAt: number | null;
  localDate: string;
  tzOffsetMinutes: number;
  durationSeconds: number | null;
  pausedMs: number;
  totalVolumeKg: number | null;
  totalSets: number | null;
  totalReps: number | null;
  estimatedKcal: number | null;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  exercises: ExportSessionExercise[];
}

/**
 * One `personal_record` row - exported for completeness/read-only fidelity
 * only. **Never written directly on import.** The post-import rebuild
 * sequence (a later agent's service layer, calling
 * `PersonalRecordService.rebuild()`/`rebuildAll()`) regenerates every record
 * from the imported sessions/sets, which is the authoritative source - a
 * record derived from history a merge or replace import just changed would
 * otherwise go stale the instant it landed. Do not add an
 * `upsertPersonalRecord` repository method for this reason; there is
 * deliberately none in `DataTransferRepository`.
 */
export interface ExportPersonalRecord {
  id: EntityId;
  exerciseId: EntityId;
  recordType: RecordType;
  /** Only meaningful for `weight_at_reps`; `null` for every other record type. A plain `number` rather than the narrower `RepBucket` union - see `exportEnvelopeSchema.ts#exportPersonalRecordSchema`'s own comment for why this level is validated by membership check, not by type. */
  repBucket: number | null;
  value: number;
  weightKg: number | null;
  reps: number | null;
  workoutSetId: EntityId | null;
  sessionId: EntityId | null;
  achievedAt: number;
  previousValue: number | null;
  isCurrent: boolean;
  createdAt: number;
  updatedAt: number;
}

/** One `body_metric_entry` row. */
export interface ExportBodyMetric {
  id: EntityId;
  metric: BodyMetricType;
  value: number;
  measuredAt: number;
  localDate: string;
  note: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

/** One `progress_photo` row - metadata only, no binary (ADR-0012 / ADR-0013: "binaries excluded"). */
export interface ExportProgressPhoto {
  id: EntityId;
  fileName: string;
  thumbName: string;
  pose: PhotoPose;
  takenAt: number;
  localDate: string;
  width: number;
  height: number;
  byteSize: number;
  note: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

/** `data.*` - one array per entity, per ADR-0013's "Shape" row. */
export interface ExportEnvelopeData {
  profile: ExportProfile;
  settings: ExportSetting[];
  customExercises: ExportCustomExercise[];
  exerciseUserData: ExportExerciseUserData[];
  exerciseVideos: ExportExerciseVideo[];
  plans: ExportPlan[];
  sessions: ExportSession[];
  /** Read-only fidelity only - see {@link ExportPersonalRecord}'s own doc comment. */
  personalRecords: ExportPersonalRecord[];
  bodyMetrics: ExportBodyMetric[];
  progressPhotos: ExportProgressPhoto[];
}

/** The literal string every valid backup file's `format` field must hold. */
export const EXPORT_FORMAT = 'gymtracker.backup' as const;

/** The current envelope version this app writes and fully understands. `migrateExport.ts` upgrades an older file's `version` to this one before validation. */
export const CURRENT_EXPORT_ENVELOPE_VERSION = 1 as const;

/** The full JSON backup envelope - ADR-0013's "JSON format" section, verbatim. */
export interface ExportEnvelopeV1 {
  format: typeof EXPORT_FORMAT;
  version: typeof CURRENT_EXPORT_ENVELOPE_VERSION;
  exportedAt: number;
  app: {
    version: string;
    schemaVersion: number;
  };
  /** Always canonical (`kg`/`cm`) - recorded for clarity per ADR-0013, never anything else. */
  units: {
    weight: 'kg';
    length: 'cm';
  };
  /** Cheap `COUNT(*)` header stats, not derived by loading every row - see `DataTransferRepository.getExportCounts()`. */
  counts: {
    sessions: number;
    sets: number;
    exercises: number;
  };
  data: ExportEnvelopeData;
}
