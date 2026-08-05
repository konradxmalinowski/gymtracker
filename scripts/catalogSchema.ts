/**
 * Zod schema for the build-time exercise catalog pipeline's output.
 *
 * Consumed by:
 *  - scripts/build-catalog.ts itself, to validate its own output before writing
 *    (ADR-0011: a broken regeneration must fail the script/CI, not ship bad data).
 *  - the future database-agent catalog seeder (database/seed/catalogSeeder.ts, not
 *    part of this phase's delegation), which reads assets/data/exercises.catalog.json
 *    and upserts into the `exercise`, `exercise_muscle` tables per
 *    docs/ARCHITECTURE.md section 7.4.
 *
 * Field names are camelCase (this file's own "app shape" per ADR-0011 decision 1,
 * not a 1:1 mirror of the snake_case SQL columns). See the mapping table in the
 * delegation report for the exact camelCase field -> SQL column correspondence.
 */

import { z } from 'zod';

/**
 * Muscle slug vocabulary, derived from docs/ARCHITECTURE.md section 7.4's
 * `muscle` table comment plus the actual value set used by the upstream
 * Free Exercise DB (yuhonas/free-exercise-db). Kept as literal upstream strings
 * (including the two multi-word entries) rather than hyphenated, mirroring how
 * ARCHITECTURE.md's own equipment example preserves "body only" verbatim -
 * these are the exact PRIMARY KEY values the parallel database-agent's `muscle`
 * lookup table seed is expected to use, since both sides read the same source
 * document and the same upstream vocabulary.
 */
export const MUSCLE_SLUGS = [
  'abdominals',
  'abductors',
  'adductors',
  'biceps',
  'calves',
  'chest',
  'forearms',
  'glutes',
  'hamstrings',
  'lats',
  'lower back',
  'middle back',
  'neck',
  'quadriceps',
  'shoulders',
  'traps',
  'triceps',
] as const;

export type MuscleSlug = (typeof MUSCLE_SLUGS)[number];

/**
 * Equipment slug vocabulary, same sourcing rationale as MUSCLE_SLUGS above.
 * Matches ARCHITECTURE.md 7.4's equipment example ('barbell', 'dumbbell',
 * 'machine', 'cable', 'body only', ...) and the upstream dataset's full value set.
 */
export const EQUIPMENT_SLUGS = [
  'bands',
  'barbell',
  'body only',
  'cable',
  'dumbbell',
  'e-z curl bar',
  'exercise ball',
  'foam roll',
  'kettlebells',
  'machine',
  'medicine ball',
  'other',
] as const;

export type EquipmentSlug = (typeof EQUIPMENT_SLUGS)[number];

export const TRACKING_TYPES = [
  'weight_reps',
  'reps_only',
  'duration',
  'distance_duration',
  'weighted_duration',
] as const;

export type TrackingType = (typeof TRACKING_TYPES)[number];

const forceSchema = z.enum(['push', 'pull', 'static']).nullable();
const mechanicSchema = z.enum(['compound', 'isolation']).nullable();
const levelSchema = z.enum(['beginner', 'intermediate', 'expert']).nullable();
const muscleSlugSchema = z.enum(MUSCLE_SLUGS);
const equipmentSlugSchema = z.enum(EQUIPMENT_SLUGS);
const trackingTypeSchema = z.enum(TRACKING_TYPES);

/** Content-addressed bundled asset filename, e.g. "3f9a1c2b7e8d4a10.webp". */
const assetKeySchema = z
  .string()
  .regex(/^[a-f0-9]{16}\.webp$/, 'expected a 16-hex-char content hash + .webp');

const catalogSlugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'expected lowercase kebab-case');

export const CatalogExerciseSchema = z.object({
  catalogSlug: catalogSlugSchema,
  nameEn: z.string().min(1),
  namePl: z.string().min(1).nullable(),
  nameSearch: z.string().min(1),
  aliases: z.array(z.string().min(1)),
  category: z.string().min(1).nullable(),
  force: forceSchema,
  mechanic: mechanicSchema,
  level: levelSchema,
  equipmentSlug: equipmentSlugSchema.nullable(),
  bodyPart: z.string().min(1).nullable(),
  trackingType: trackingTypeSchema,
  instructions: z.array(z.string().min(1)),
  images: z.array(assetKeySchema),
  primaryMuscles: z.array(muscleSlugSchema),
  secondaryMuscles: z.array(muscleSlugSchema),
});

export type CatalogExercise = z.infer<typeof CatalogExerciseSchema>;

export const CatalogFileSchema = z.object({
  /**
   * Manually bumped by whoever re-runs the pipeline against a new upstream
   * release (ADR-0011 decision 1). Never derived from a timestamp or hash of
   * output content, so an unchanged upstream + unchanged CATALOG_VERSION
   * constant produces a byte-stable file across runs.
   */
  catalogVersion: z.string().min(1),
  exercises: z.array(CatalogExerciseSchema).min(1),
});

export type CatalogFile = z.infer<typeof CatalogFileSchema>;

/**
 * Overlay: assets/data/exercises.pl.json
 * Shape per ADR-0011 decision 3. Hand-curated, keyed by catalogSlug, never
 * written to by this build script once it exists (only read).
 */
export const PlOverlaySchema = z.record(
  z.string(),
  z.object({
    name: z.string().min(1),
    aliases: z.array(z.string().min(1)).default([]),
  }),
);

export type PlOverlay = z.infer<typeof PlOverlaySchema>;

/**
 * Overlay: assets/data/exercises.videos.json
 * Shape per ADR-0011 decision 3. Hand-curated, keyed by catalogSlug, never
 * written to by this build script once it exists (only read).
 */
export const VideoOverlaySchema = z.record(
  z.string(),
  z.array(
    z.object({
      url: z.string().url(),
      title: z.string().min(1),
      channel: z.string().min(1).nullable().optional(),
      language: z.enum(['en', 'pl']),
    }),
  ),
);

export type VideoOverlay = z.infer<typeof VideoOverlaySchema>;

/**
 * Loose shape of a single upstream Free Exercise DB record - validated on
 * fetch so an upstream schema change fails loudly (build-time, not silently)
 * rather than producing subtly wrong catalog rows. Deliberately permissive
 * on nullable fields per the confirmed upstream contract (force/mechanic/
 * equipment nullable in practice).
 */
export const UpstreamExerciseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  force: z.string().nullable().optional(),
  level: z.string().nullable().optional(),
  mechanic: z.string().nullable().optional(),
  equipment: z.string().nullable().optional(),
  primaryMuscles: z.array(z.string()).default([]),
  secondaryMuscles: z.array(z.string()).default([]),
  instructions: z.array(z.string()).default([]),
  category: z.string().nullable().optional(),
  images: z.array(z.string()).default([]),
});

export type UpstreamExercise = z.infer<typeof UpstreamExerciseSchema>;

export const UpstreamDatasetSchema = z.array(UpstreamExerciseSchema).min(1);
