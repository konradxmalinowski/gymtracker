import type { DatabaseContext, SqlExecutor } from '@/repositories/contracts/database';
import { generateUuidV7 } from '../ids/uuidv7';

/**
 * The catalog JSON shape this seeder consumes - ARCHITECTURE.md section 7.4
 * (`exercise`/`exercise_muscle`/`exercise_video`) plus ADR-0011 decision 1. Matches,
 * but does not import, whatever `scripts/build-catalog.ts` (a parallel agent's file)
 * eventually emits at `assets/data/exercises.catalog.json` - see
 * `loadCatalogAsset.ts` for the runtime read of that path.
 */
export interface CatalogMuscleRef {
  slug: string;
  role: 'primary' | 'secondary';
}

export interface CatalogVideoRef {
  url: string;
  title: string;
  channel?: string | null;
  language?: 'en' | 'pl';
  sortOrder?: number;
}

export interface CatalogExerciseEntry {
  catalogSlug: string;
  nameEn: string;
  namePl?: string | null;
  nameSearch: string;
  aliases?: string[];
  category?: string | null;
  force?: 'push' | 'pull' | 'static' | null;
  mechanic?: 'compound' | 'isolation' | null;
  level?: 'beginner' | 'intermediate' | 'expert' | null;
  equipmentSlug?: string | null;
  bodyPart?: string | null;
  trackingType?:
    'weight_reps' | 'reps_only' | 'duration' | 'distance_duration' | 'weighted_duration';
  instructions?: string[];
  images?: string[];
  muscles?: CatalogMuscleRef[];
  videos?: CatalogVideoRef[];
}

export interface CatalogFile {
  catalogVersion: string;
  exercises: CatalogExerciseEntry[];
}

export interface CatalogSeederDeps {
  now?: () => number;
  generateId?: () => string;
}

export interface CatalogSeedResult {
  skipped: boolean;
  upsertedCount: number;
  fromVersion: string | null;
  toVersion: string;
}

const CATALOG_VERSION_SETTING_KEY = 'catalog.version';

/**
 * Idempotent, versioned catalog seed - ADR-0011 decision 1. Compares the bundled
 * `catalog.catalogVersion` against the `catalog.version` app setting; when they
 * match this is a true no-op (no `run`/`batch`/`transaction` call is made at all,
 * not just "no visible change" - asserted by a test spying on the executor).
 *
 * When versions differ, everything below runs inside a single transaction:
 * upserts every entry into `exercise` (matched by `catalog_slug`, `source` always
 * `'catalog'`), replaces its `exercise_muscle` rows and its `source = 'curated'`
 * `exercise_video` rows, then rebuilds `exercise_fts` wholesale. It never reads or
 * writes `exercise_user_data` - favorites, notes and per-exercise rest overrides are
 * untouched by construction, not by a filter that could be gotten wrong.
 */
export async function seedCatalog(
  db: DatabaseContext,
  catalog: CatalogFile,
  deps: CatalogSeederDeps = {},
): Promise<CatalogSeedResult> {
  const now = deps.now ?? Date.now;
  const generateId = deps.generateId ?? generateUuidV7;

  const currentVersion = await getAppSetting(db, CATALOG_VERSION_SETTING_KEY);
  if (currentVersion === catalog.catalogVersion) {
    return {
      skipped: true,
      upsertedCount: 0,
      fromVersion: currentVersion,
      toVersion: catalog.catalogVersion,
    };
  }

  await db.transaction(async (tx) => {
    for (const entry of catalog.exercises) {
      const exerciseRow = await upsertExercise(tx, entry, generateId(), now());
      await replaceExerciseMuscles(tx, exerciseRow.id, entry.muscles ?? []);
      await replaceCuratedVideos(tx, exerciseRow.id, entry.videos ?? [], generateId, now());
    }
    await rebuildExerciseFts(tx);
    await setAppSetting(tx, CATALOG_VERSION_SETTING_KEY, catalog.catalogVersion, now());
  });

  return {
    skipped: false,
    upsertedCount: catalog.exercises.length,
    fromVersion: currentVersion,
    toVersion: catalog.catalogVersion,
  };
}

async function upsertExercise(
  tx: SqlExecutor,
  entry: CatalogExerciseEntry,
  newId: string,
  now: number,
): Promise<{ id: string }> {
  const row = await tx.selectOne<{ id: string }>(
    `INSERT INTO exercise (
       id, source, catalog_slug, name_en, name_pl, name_search, aliases, category,
       force, mechanic, level, equipment_slug, body_part, tracking_type,
       instructions, images, created_at, updated_at
     ) VALUES (?, 'catalog', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(catalog_slug) DO UPDATE SET
       name_en = excluded.name_en,
       name_pl = excluded.name_pl,
       name_search = excluded.name_search,
       aliases = excluded.aliases,
       category = excluded.category,
       force = excluded.force,
       mechanic = excluded.mechanic,
       level = excluded.level,
       equipment_slug = excluded.equipment_slug,
       body_part = excluded.body_part,
       tracking_type = excluded.tracking_type,
       instructions = excluded.instructions,
       images = excluded.images,
       updated_at = excluded.updated_at
     RETURNING id`,
    [
      newId,
      entry.catalogSlug,
      entry.nameEn,
      entry.namePl ?? null,
      entry.nameSearch,
      JSON.stringify(entry.aliases ?? []),
      entry.category ?? null,
      entry.force ?? null,
      entry.mechanic ?? null,
      entry.level ?? null,
      entry.equipmentSlug ?? null,
      entry.bodyPart ?? null,
      entry.trackingType ?? 'weight_reps',
      JSON.stringify(entry.instructions ?? []),
      JSON.stringify(entry.images ?? []),
      now,
      now,
    ],
  );
  if (!row) {
    throw new Error(`Catalog upsert for "${entry.catalogSlug}" did not return an id.`);
  }
  return row;
}

async function replaceExerciseMuscles(
  tx: SqlExecutor,
  exerciseId: string,
  muscles: CatalogMuscleRef[],
): Promise<void> {
  await tx.run('DELETE FROM exercise_muscle WHERE exercise_id = ?', [exerciseId]);
  for (const muscle of muscles) {
    await tx.run('INSERT INTO exercise_muscle (exercise_id, muscle_slug, role) VALUES (?, ?, ?)', [
      exerciseId,
      muscle.slug,
      muscle.role,
    ]);
  }
}

async function replaceCuratedVideos(
  tx: SqlExecutor,
  exerciseId: string,
  videos: CatalogVideoRef[],
  generateId: () => string,
  now: number,
): Promise<void> {
  await tx.run("DELETE FROM exercise_video WHERE exercise_id = ? AND source = 'curated'", [
    exerciseId,
  ]);
  for (const [index, video] of videos.entries()) {
    await tx.run(
      `INSERT INTO exercise_video (id, exercise_id, url, title, channel, language, source, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'curated', ?, ?, ?)`,
      [
        generateId(),
        exerciseId,
        video.url,
        video.title,
        video.channel ?? null,
        video.language ?? 'en',
        video.sortOrder ?? index,
        now,
        now,
      ],
    );
  }
}

/**
 * Wholesale rebuild of the contentless FTS5 index, covering every non-deleted
 * exercise (catalog and custom alike) - matches the `schema.sql` comment on
 * `exercise_fts`: "rebuilt wholesale by the catalog seeder". `'delete-all'` is the
 * documented FTS5 special command for clearing a contentless table without
 * dropping/recreating it. The FTS `rowid` is bound to `exercise`'s own implicit
 * SQLite `rowid` (the table is not `WITHOUT ROWID`), which is how search results
 * join back to `exercise` rows.
 */
async function rebuildExerciseFts(tx: SqlExecutor): Promise<void> {
  await tx.run("INSERT INTO exercise_fts(exercise_fts) VALUES('delete-all')");
  await tx.run(`
    INSERT INTO exercise_fts(rowid, name_en, name_pl, aliases, equipment_slug, muscles)
    SELECT e.rowid,
           e.name_en,
           e.name_pl,
           e.aliases,
           e.equipment_slug,
           COALESCE((SELECT group_concat(em.muscle_slug, ' ') FROM exercise_muscle em WHERE em.exercise_id = e.id), '')
    FROM exercise e
    WHERE e.deleted_at IS NULL
  `);
}

async function getAppSetting(db: SqlExecutor, key: string): Promise<string | null> {
  const row = await db.selectOne<{ value: string }>('SELECT value FROM app_setting WHERE key = ?', [
    key,
  ]);
  if (!row) return null;
  return JSON.parse(row.value) as string;
}

async function setAppSetting(
  tx: SqlExecutor,
  key: string,
  value: string,
  updatedAt: number,
): Promise<void> {
  await tx.run(
    `INSERT INTO app_setting (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, JSON.stringify(value), updatedAt],
  );
}
