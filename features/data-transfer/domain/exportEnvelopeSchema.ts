/**
 * Zod schemas for the JSON backup envelope - ADR-0013's hard rule: "Every
 * level is parsed with a Zod schema before a single row is written." Every
 * nested level gets its own named, individually-exported schema (not just
 * one giant inline object) so `migrateExport.ts` can report which level
 * failed, and so a future v2 envelope can reuse whichever of these an
 * unchanged sub-shape still applies to.
 *
 * Mirrors `types/ExportEnvelope.ts` field-for-field - keep the two in sync by
 * hand; there is no schema-to-type codegen in this project
 * (`repositories/settings/settingsSchema.ts` is the precedent for this
 * "schema next to its hand-written type" pattern).
 *
 * This file imports `SET_TYPES` from `workout-logging`'s barrel rather than
 * duplicating the literal union the way `records`' `Estimated1RM.ts` does:
 * `data-transfer` is architecturally the one feature allowed to depend on
 * everything (ARCHITECTURE.md section 9.1 - "depends on everything and is
 * built last"), so there is no cycle risk here to guard against by
 * duplicating.
 */
import { z } from 'zod';
import { SET_TYPES } from '@/features/workout-logging';
import { RECORD_TYPES, WEIGHT_AT_REPS_BUCKETS } from '@/features/records';
import { BODY_METRIC_TYPES } from '@/features/body-metrics';
import { EXPORT_FORMAT, CURRENT_EXPORT_ENVELOPE_VERSION } from '../types/ExportEnvelope';

// --- profile / settings --------------------------------------------------

export const exportProfileSchema = z.object({
  nickname: z.string(),
  avatarFileName: z.string().nullable(),
  birthDate: z.string().nullable(),
  sex: z.enum(['male', 'female', 'unspecified']).nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const exportSettingSchema = z.object({
  key: z.string(),
  // Deliberately `z.unknown()`, not a per-key schema: `app_setting.value`'s
  // real shape is validated by `SettingsRepository`/`SETTINGS_SCHEMA` at
  // import time (the layer that already owns "what does this key mean"),
  // not duplicated here. This schema only guarantees the *envelope* is
  // well-formed, not that every setting value is one this app version
  // recognizes - an unrecognized key/value falls back to the code default,
  // same as `SqliteSettingsRepository.get()` already does for a corrupt row.
  value: z.unknown(),
  updatedAt: z.number(),
});

// --- exercises -------------------------------------------------------------

export const exportExerciseMuscleRefSchema = z.object({
  slug: z.string(),
  role: z.enum(['primary', 'secondary']),
});

export const exportCustomExerciseSchema = z.object({
  id: z.string(),
  nameEn: z.string(),
  namePl: z.string().nullable(),
  nameSearch: z.string(),
  aliases: z.array(z.string()),
  category: z.string().nullable(),
  force: z.enum(['push', 'pull', 'static']).nullable(),
  mechanic: z.enum(['compound', 'isolation']).nullable(),
  level: z.enum(['beginner', 'intermediate', 'expert']).nullable(),
  equipmentSlug: z.string().nullable(),
  bodyPart: z.string().nullable(),
  trackingType: z.enum([
    'weight_reps',
    'reps_only',
    'duration',
    'distance_duration',
    'weighted_duration',
  ]),
  instructions: z.array(z.string()),
  images: z.array(z.string()),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable(),
  muscles: z.array(exportExerciseMuscleRefSchema),
});

export const exportExerciseUserDataSchema = z.object({
  exerciseId: z.string(),
  isFavorite: z.boolean(),
  favoritedAt: z.number().nullable(),
  note: z.string().nullable(),
  defaultRestSeconds: z.number().nullable(),
  displayNameOverride: z.string().nullable(),
  lastPerformedAt: z.number().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const exportExerciseVideoSchema = z.object({
  id: z.string(),
  exerciseId: z.string(),
  url: z.string(),
  title: z.string(),
  channel: z.string().nullable(),
  language: z.enum(['en', 'pl']),
  sortOrder: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable(),
});

// --- plans -------------------------------------------------------------

export const exportPlanDayExerciseSchema = z.object({
  id: z.string(),
  exerciseId: z.string(),
  sortOrder: z.number(),
  targetSets: z.number().nullable(),
  targetRepMin: z.number().nullable(),
  targetRepMax: z.number().nullable(),
  targetRpe: z.number().nullable(),
  restSeconds: z.number().nullable(),
  supersetGroup: z.number().nullable(),
  note: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable(),
});

export const exportPlanDaySchema = z.object({
  id: z.string(),
  name: z.string(),
  note: z.string().nullable(),
  sortOrder: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable(),
  exercises: z.array(exportPlanDayExerciseSchema),
});

export const exportPlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  color: z.string().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable(),
  days: z.array(exportPlanDaySchema),
});

// --- sessions -------------------------------------------------------------

export const exportWorkoutSetSchema = z.object({
  id: z.string(),
  setIndex: z.number(),
  setType: z.enum(SET_TYPES),
  parentSetId: z.string().nullable(),
  weightKg: z.number().nullable(),
  reps: z.number().nullable(),
  durationSeconds: z.number().nullable(),
  distanceM: z.number().nullable(),
  rpe: z.number().nullable(),
  isCompleted: z.boolean(),
  completedAt: z.number().nullable(),
  performedAt: z.number(),
  note: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable(),
});

export const exportSessionExerciseSchema = z.object({
  id: z.string(),
  exerciseId: z.string(),
  exerciseNameSnapshot: z.string(),
  sortOrder: z.number(),
  supersetGroup: z.number().nullable(),
  restSecondsOverride: z.number().nullable(),
  note: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable(),
  sets: z.array(exportWorkoutSetSchema),
});

export const exportSessionSchema = z.object({
  id: z.string(),
  planId: z.string().nullable(),
  planDayId: z.string().nullable(),
  planNameSnapshot: z.string().nullable(),
  planDayNameSnapshot: z.string().nullable(),
  title: z.string(),
  status: z.enum(['in_progress', 'completed', 'discarded']),
  startedAt: z.number(),
  finishedAt: z.number().nullable(),
  localDate: z.string(),
  tzOffsetMinutes: z.number(),
  durationSeconds: z.number().nullable(),
  pausedMs: z.number(),
  totalVolumeKg: z.number().nullable(),
  totalSets: z.number().nullable(),
  totalReps: z.number().nullable(),
  estimatedKcal: z.number().nullable(),
  notes: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable(),
  exercises: z.array(exportSessionExerciseSchema),
});

// --- personal records / body metrics / progress photos --------------------

/** Read-only fidelity only - see `ExportPersonalRecord`'s own doc comment. Validated the same as every other level regardless, per ADR-0013's blanket rule. */
export const exportPersonalRecordSchema = z.object({
  id: z.string(),
  exerciseId: z.string(),
  recordType: z.enum(RECORD_TYPES),
  // A plain, membership-checked number rather than a `z.literal` union: this
  // level is read-only fidelity data (see `ExportPersonalRecord`'s own doc
  // comment - never written back on import), so the extra type-level
  // precision a literal union would buy costs more ceremony than it's worth
  // here.
  repBucket: z
    .number()
    .refine((value) => (WEIGHT_AT_REPS_BUCKETS as readonly number[]).includes(value), {
      message: `repBucket must be one of ${WEIGHT_AT_REPS_BUCKETS.join(', ')}`,
    })
    .nullable(),
  value: z.number(),
  weightKg: z.number().nullable(),
  reps: z.number().nullable(),
  workoutSetId: z.string().nullable(),
  sessionId: z.string().nullable(),
  achievedAt: z.number(),
  previousValue: z.number().nullable(),
  isCurrent: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const exportBodyMetricSchema = z.object({
  id: z.string(),
  metric: z.enum(BODY_METRIC_TYPES),
  value: z.number(),
  measuredAt: z.number(),
  localDate: z.string(),
  note: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable(),
});

export const exportProgressPhotoSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  thumbName: z.string(),
  pose: z.enum(['front', 'side', 'back', 'other']),
  takenAt: z.number(),
  localDate: z.string(),
  width: z.number(),
  height: z.number(),
  byteSize: z.number(),
  note: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable(),
});

// --- the full envelope ------------------------------------------------

export const exportEnvelopeDataSchema = z.object({
  profile: exportProfileSchema,
  settings: z.array(exportSettingSchema),
  customExercises: z.array(exportCustomExerciseSchema),
  exerciseUserData: z.array(exportExerciseUserDataSchema),
  exerciseVideos: z.array(exportExerciseVideoSchema),
  plans: z.array(exportPlanSchema),
  sessions: z.array(exportSessionSchema),
  personalRecords: z.array(exportPersonalRecordSchema),
  bodyMetrics: z.array(exportBodyMetricSchema),
  progressPhotos: z.array(exportProgressPhotoSchema),
});

/**
 * The full v1 envelope. `format`/`version` are `z.literal`s, not `z.enum`s -
 * this schema only ever validates a file `migrateExport.ts` has already
 * confirmed is `version === 1` (or upgraded to it); a mismatched literal here
 * is a defensive double-check, not the primary format/version gate (that
 * gate is `migrateExport.ts`'s own explicit checks, which run first and
 * produce a more specific error message than a generic Zod issue would).
 */
export const exportEnvelopeV1Schema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(CURRENT_EXPORT_ENVELOPE_VERSION),
  exportedAt: z.number(),
  app: z.object({
    version: z.string(),
    schemaVersion: z.number(),
  }),
  units: z.object({
    weight: z.literal('kg'),
    length: z.literal('cm'),
  }),
  counts: z.object({
    sessions: z.number(),
    sets: z.number(),
    exercises: z.number(),
  }),
  data: exportEnvelopeDataSchema,
});
