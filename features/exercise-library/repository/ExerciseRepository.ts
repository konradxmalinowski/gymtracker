import type { SqlExecutor } from '@/repositories/contracts/database';
import type { EntityId } from '@/repositories/contracts/repository';
import type { CatalogExerciseEntry } from '@/database/seed/catalogSeeder';

/** ARCHITECTURE.md section 7.4 `exercise.source` check constraint. */
export type ExerciseSource = 'catalog' | 'custom';
/** ARCHITECTURE.md section 7.4 `exercise.force` check constraint. */
export type ExerciseForce = 'push' | 'pull' | 'static';
/** ARCHITECTURE.md section 7.4 `exercise.mechanic` check constraint. */
export type ExerciseMechanic = 'compound' | 'isolation';
/** ARCHITECTURE.md section 7.4 `exercise.level` check constraint. */
export type ExerciseLevel = 'beginner' | 'intermediate' | 'expert';
/** ARCHITECTURE.md section 7.4 `exercise.tracking_type` check constraint. */
export type ExerciseTrackingType =
  'weight_reps' | 'reps_only' | 'duration' | 'distance_duration' | 'weighted_duration';
/** ARCHITECTURE.md section 7.4 `exercise_muscle.role` check constraint. */
export type MuscleRole = 'primary' | 'secondary';
/** `ExerciseQuery.context` - filters via `equipment.is_gym`/`equipment.is_home`. */
export type ExerciseContext = 'gym' | 'home';

export interface ExerciseMuscleRef {
  slug: string;
  role: MuscleRole;
}

export interface ExerciseVideo {
  id: EntityId;
  url: string;
  title: string;
  channel: string | null;
  language: 'en' | 'pl';
  source: 'curated' | 'user';
  sortOrder: number;
}

/** `exercise_user_data` fields (ARCHITECTURE.md 7.4). Defaults apply when no row exists yet - it is created lazily on first favorite/note/rest-override write. */
export interface ExerciseUserData {
  isFavorite: boolean;
  favoritedAt: number | null;
  note: string | null;
  defaultRestSeconds: number | null;
  displayNameOverride: string | null;
  lastPerformedAt: number | null;
}

/** Full detail-view shape: `exercise` plus its muscles, videos and `exercise_user_data`, joined in. */
export interface Exercise {
  id: EntityId;
  source: ExerciseSource;
  catalogSlug: string | null;
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
  muscles: ExerciseMuscleRef[];
  videos: ExerciseVideo[];
  userData: ExerciseUserData;
}

/** Lighter shape for search/list results - ARCHITECTURE.md section 8.3. */
export interface ExerciseListItem {
  id: EntityId;
  source: ExerciseSource;
  catalogSlug: string | null;
  nameEn: string;
  namePl: string | null;
  displayNameOverride: string | null;
  level: ExerciseLevel | null;
  equipmentSlug: string | null;
  bodyPart: string | null;
  trackingType: ExerciseTrackingType;
  /** `images[0]`, or `null` when the exercise has no bundled images. */
  primaryImage: string | null;
  isFavorite: boolean;
}

/** ARCHITECTURE.md section 8.3, verbatim - `muscleSlugs`/`equipmentSlugs` are OR-within-category, AND-across-categories. */
export interface ExerciseQuery {
  text?: string;
  muscleSlugs?: readonly string[];
  equipmentSlugs?: readonly string[];
  bodyParts?: readonly string[];
  level?: ExerciseLevel;
  favoritesOnly?: boolean;
  context?: ExerciseContext;
  source?: ExerciseSource;
  limit?: number;
  offset?: number;
}

export interface CreateCustomExerciseInput {
  nameEn: string;
  namePl?: string | null;
  aliases?: string[];
  category?: string | null;
  force?: ExerciseForce | null;
  mechanic?: ExerciseMechanic | null;
  level?: ExerciseLevel | null;
  equipmentSlug?: string | null;
  bodyPart?: string | null;
  trackingType?: ExerciseTrackingType;
  instructions?: string[];
  images?: string[];
  /**
   * Primary + optional secondary muscles (confirmed with the product owner - not a
   * single-muscle simplification). "At least one primary muscle" is a form-level
   * (Zod) rule for `ExerciseService`/the create form to enforce, not something this
   * repository validates - the schema itself allows zero rows in `exercise_muscle`.
   */
  muscles?: ExerciseMuscleRef[];
}

/** Every field optional - only fields present are changed. Providing `muscles` replaces the full set (not a merge). */
export type UpdateCustomExercisePatch = Partial<CreateCustomExerciseInput>;

export interface PlanReference {
  planId: EntityId;
  planName: string;
}

/**
 * `ExerciseRepository` - ARCHITECTURE.md section 8.3, per this phase's task brief
 * "this exact contract, copied from ARCHITECTURE.md section 8.3, do not deviate
 * from the method names or the `ExerciseQuery` shape". All 10 of those methods are
 * present below, unchanged.
 *
 * `deleteCustom` is the one addition beyond that literal list: the 10-method
 * contract in ARCHITECTURE.md never mentions a delete method at all, but this
 * phase's own task brief separately asks for "a deleteCustom/soft-delete path" via
 * `BaseSqliteRepository`, and the business rule that only `source = 'custom'` rows
 * are ever deletable has to be enforced somewhere. Added here rather than invented
 * ad hoc by whichever feature-service consumer needs it first.
 *
 * Every method accepts an optional `tx` (ARCHITECTURE.md section 8.2's composition
 * pattern) except `replaceCatalog`, which always delegates to
 * `catalogSeeder.seedCatalog()` and therefore always owns its own transaction - see
 * `SqliteExerciseRepository.replaceCatalog()`'s doc comment.
 */
export interface ExerciseRepository {
  /** FTS + filters + favorites-first ordering. Empty `text` skips FTS (ADR-0003). */
  search(query: ExerciseQuery, tx?: SqlExecutor): Promise<ExerciseListItem[]>;
  /** With muscles, videos, and user data (favorite/note/rest-override). */
  findById(id: EntityId, tx?: SqlExecutor): Promise<Exercise | null>;
  findByCatalogSlug(slug: string, tx?: SqlExecutor): Promise<Exercise | null>;
  createCustom(input: CreateCustomExerciseInput, tx?: SqlExecutor): Promise<Exercise>;
  /** @throws {ExerciseNotEditableError} when `id` names a catalog-source exercise. */
  updateCustom(id: EntityId, patch: UpdateCustomExercisePatch, tx?: SqlExecutor): Promise<Exercise>;
  /** @throws {ExerciseNotEditableError} when `id` names a catalog-source exercise. */
  deleteCustom(id: EntityId, tx?: SqlExecutor): Promise<void>;
  setFavorite(id: EntityId, value: boolean, tx?: SqlExecutor): Promise<void>;
  setNote(id: EntityId, note: string | null, tx?: SqlExecutor): Promise<void>;
  setDefaultRest(id: EntityId, seconds: number | null, tx?: SqlExecutor): Promise<void>;
  /** Powers "cannot delete, used in...". Deduped by plan. */
  listReferencingPlans(id: EntityId, tx?: SqlExecutor): Promise<PlanReference[]>;
  /** Seeder path only - rewrites catalog rows + FTS, never touches `exercise_user_data`. */
  replaceCatalog(entries: readonly CatalogExerciseEntry[], catalogVersion: string): Promise<void>;
}
