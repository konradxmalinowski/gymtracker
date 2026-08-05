/**
 * Build-time exercise catalog pipeline (ADR-0011 decision 1).
 *
 * Fetches the Free Exercise DB (yuhonas/free-exercise-db, Unlicense), normalizes
 * it into this app's own shape, downscales and bundles every image as WebP
 * (ADR-0011 decision 2 - full bundling, no lazy network path), and writes:
 *
 *   assets/data/exercises.catalog.json   regenerable, never hand-edited
 *   assets/data/exercises.pl.json        overlay skeleton, created once, never overwritten
 *   assets/data/exercises.videos.json    overlay skeleton, created once, never overwritten
 *   assets/exercises/<hash>.webp         content-addressed bundled imagery
 *
 * Run manually when the upstream dataset is refreshed (not part of the app's own
 * build or test suite - ADR-0011's "Negative" consequence). Re-running against an
 * unchanged upstream dataset and an unchanged CATALOG_VERSION must produce a
 * byte-stable exercises.catalog.json (no embedded timestamps, no non-deterministic
 * ordering) so the file can be reviewed with `git diff --stat`.
 *
 * Usage: node scripts/build-catalog.ts
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import {
  CatalogFileSchema,
  EQUIPMENT_SLUGS,
  MUSCLE_SLUGS,
  PlOverlaySchema,
  UpstreamDatasetSchema,
  VideoOverlaySchema,
} from './catalogSchema.ts';
import type {
  CatalogExercise,
  EquipmentSlug,
  MuscleSlug,
  PlOverlay,
  TrackingType,
  UpstreamExercise,
} from './catalogSchema.ts';

/* ------------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------------ */

/**
 * Bump manually when re-running this script against a newer upstream release.
 * Never derived from a timestamp/hash - an unchanged upstream + unchanged
 * version constant must produce an identical file on re-run.
 */
const CATALOG_VERSION = '1';

const UPSTREAM_DATASET_URL =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const UPSTREAM_IMAGE_BASE_URL =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(REPO_ROOT, 'assets', 'data');
const IMAGES_DIR = path.join(REPO_ROOT, 'assets', 'exercises');
const CATALOG_OUTPUT_PATH = path.join(DATA_DIR, 'exercises.catalog.json');
const PL_OVERLAY_PATH = path.join(DATA_DIR, 'exercises.pl.json');
const VIDEOS_OVERLAY_PATH = path.join(DATA_DIR, 'exercises.videos.json');

const IMAGE_MAX_DIMENSION = 512;
const IMAGE_WEBP_QUALITY = 70;
const DOWNLOAD_CONCURRENCY = 20;
const DOWNLOAD_RETRIES = 3;
const DOWNLOAD_TIMEOUT_MS = 15_000;

/**
 * docs/ARCHITECTURE.md section 7.4's `muscle.body_part` comment vocabulary:
 * 'upper','lower','core','arms','back','shoulders','legs'. Used only to derive
 * the freeform (no CHECK constraint, no FK) `exercise.body_part` column from an
 * exercise's first primary muscle - a convenience field, not a table needing
 * cross-agent slug agreement the way muscle/equipment slugs do.
 */
const MUSCLE_TO_BODY_PART: Record<MuscleSlug, string> = {
  abdominals: 'core',
  abductors: 'legs',
  adductors: 'legs',
  biceps: 'arms',
  calves: 'legs',
  chest: 'upper',
  forearms: 'arms',
  glutes: 'legs',
  hamstrings: 'legs',
  lats: 'back',
  'lower back': 'back',
  'middle back': 'back',
  neck: 'upper',
  quadriceps: 'legs',
  shoulders: 'shoulders',
  traps: 'back',
  triceps: 'arms',
};

const MUSCLE_SLUG_SET: ReadonlySet<string> = new Set(MUSCLE_SLUGS);
const EQUIPMENT_SLUG_SET: ReadonlySet<string> = new Set(EQUIPMENT_SLUGS);

/* ------------------------------------------------------------------------ *
 * Small generic helpers
 * ------------------------------------------------------------------------ */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mapWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const current = items[cursor++]!;
      await fn(current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
}

async function fetchBufferWithRetry(url: string): Promise<Buffer> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= DOWNLOAD_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      lastError = error;
      if (attempt < DOWNLOAD_RETRIES) {
        await sleep(250 * attempt);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Diacritic-folding per docs/ARCHITECTURE.md 7.4's FTS note: `remove_diacritics 2`
 * is what makes "lezac" match "leżąc". NFD + combining-mark strip handles most
 * Polish diacritics (ą, ć, ę, ń, ó, ś, ź, ż); ł/Ł has no canonical decomposition
 * in Unicode (it does not compose from "l" + a combining mark), so it needs an
 * explicit replacement or it survives NFD untouched.
 */
function foldDiacritics(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[łŁ]/g, 'l')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function slugify(id: string): string {
  return id
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/* ------------------------------------------------------------------------ *
 * Upstream field normalization (fail loud on an unmapped vocabulary value -
 * a silent mismap is worse than a broken build here, since it would seed
 * data that fails an FK constraint or a slug lookup much later, further from
 * the actual cause).
 * ------------------------------------------------------------------------ */

function normalizeMuscle(raw: string, exerciseId: string): MuscleSlug {
  const value = raw.trim().toLowerCase();
  if (!MUSCLE_SLUG_SET.has(value)) {
    throw new Error(
      `Unknown muscle "${raw}" on upstream exercise "${exerciseId}" - not in MUSCLE_SLUGS (scripts/catalogSchema.ts)`,
    );
  }
  return value as MuscleSlug;
}

function normalizeEquipment(
  raw: string | null | undefined,
  exerciseId: string,
): EquipmentSlug | null {
  if (raw === null || raw === undefined) return null;
  const value = raw.trim().toLowerCase();
  if (value === '') return null;
  if (!EQUIPMENT_SLUG_SET.has(value)) {
    throw new Error(
      `Unknown equipment "${raw}" on upstream exercise "${exerciseId}" - not in EQUIPMENT_SLUGS (scripts/catalogSchema.ts)`,
    );
  }
  return value as EquipmentSlug;
}

function normalizeForce(raw: string | null | undefined): 'push' | 'pull' | 'static' | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (value === 'push' || value === 'pull' || value === 'static') return value;
  throw new Error(`Unknown force value "${raw}"`);
}

function normalizeMechanic(raw: string | null | undefined): 'compound' | 'isolation' | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (value === 'compound' || value === 'isolation') return value;
  throw new Error(`Unknown mechanic value "${raw}"`);
}

function normalizeLevel(
  raw: string | null | undefined,
): 'beginner' | 'intermediate' | 'expert' | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (value === 'beginner' || value === 'intermediate' || value === 'expert') return value;
  throw new Error(`Unknown level value "${raw}"`);
}

/**
 * Coarse, conservative default. The upstream dataset has no tracking-type
 * concept of its own; getting this exactly right per exercise (e.g. distinguishing
 * a rep-based bodyweight move from a weighted one) is content curation, out of
 * this pipeline's scope. Stretching/cardio default to time-based tracking;
 * everything else defaults to the most common case, weight_reps.
 */
function deriveTrackingType(category: string | null): TrackingType {
  if (category === 'stretching' || category === 'cardio') return 'duration';
  return 'weight_reps';
}

/* ------------------------------------------------------------------------ *
 * Overlay files - read-only after creation. This script must never overwrite
 * curated content (ADR-0011 decision 3: "hand-curated... never clobbers
 * curation work").
 * ------------------------------------------------------------------------ */

function loadOrCreateOverlay<T>(
  filePath: string,
  schema: { parse: (input: unknown) => T },
  skeleton: T,
): T {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `${JSON.stringify(skeleton, null, 2)}\n`);
    console.log(`[build-catalog] created overlay skeleton: ${path.relative(REPO_ROOT, filePath)}`);
    return skeleton;
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${filePath} is not valid JSON: ${(error as Error).message}`);
  }
  return schema.parse(parsedJson);
}

/* ------------------------------------------------------------------------ *
 * Imagery: download, content-hash, resize, WebP-encode, write.
 * The output filename is derived from a hash of the *downloaded* bytes, so
 * identical upstream images (ADR-0011 notes ~25 duplicate sets) are written
 * once regardless of how many exercises reference them, and re-running the
 * script against unchanged upstream images reuses the same filenames.
 * ------------------------------------------------------------------------ */

async function downloadAndBundleImage(relativeUpstreamPath: string): Promise<string | null> {
  const url =
    UPSTREAM_IMAGE_BASE_URL + relativeUpstreamPath.split('/').map(encodeURIComponent).join('/');
  try {
    const raw = await fetchBufferWithRetry(url);
    const hash = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
    const assetKey = `${hash}.webp`;
    const outputPath = path.join(IMAGES_DIR, assetKey);
    if (!fs.existsSync(outputPath)) {
      const webpBuffer = await sharp(raw)
        .resize({
          width: IMAGE_MAX_DIMENSION,
          height: IMAGE_MAX_DIMENSION,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: IMAGE_WEBP_QUALITY })
        .toBuffer();
      fs.writeFileSync(outputPath, webpBuffer);
    }
    return assetKey;
  } catch (error) {
    console.warn(
      `[build-catalog] image unavailable, exercise will show fewer/no images for it: ${url} (${(error as Error).message})`,
    );
    return null;
  }
}

async function bundleAllImages(
  upstream: readonly UpstreamExercise[],
): Promise<Map<string, string[]>> {
  const slotsByExerciseId = new Map<string, (string | null)[]>();
  const jobs: { exerciseId: string; relativePath: string; slotIndex: number }[] = [];

  for (const raw of upstream) {
    slotsByExerciseId.set(raw.id, new Array(raw.images.length).fill(null));
    raw.images.forEach((relativePath, slotIndex) => {
      jobs.push({ exerciseId: raw.id, relativePath, slotIndex });
    });
  }

  let completed = 0;
  await mapWithConcurrency(jobs, DOWNLOAD_CONCURRENCY, async (job) => {
    const assetKey = await downloadAndBundleImage(job.relativePath);
    const slots = slotsByExerciseId.get(job.exerciseId);
    if (slots) slots[job.slotIndex] = assetKey;
    completed++;
    if (completed % 200 === 0 || completed === jobs.length) {
      console.log(`[build-catalog] images processed: ${completed}/${jobs.length}`);
    }
  });

  const result = new Map<string, string[]>();
  for (const [exerciseId, slots] of slotsByExerciseId) {
    result.set(
      exerciseId,
      slots.filter((key): key is string => key !== null),
    );
  }
  return result;
}

/* ------------------------------------------------------------------------ *
 * Per-exercise normalization
 * ------------------------------------------------------------------------ */

function buildCatalogExercise(
  raw: UpstreamExercise,
  plOverlay: PlOverlay,
  images: readonly string[],
): CatalogExercise {
  const catalogSlug = slugify(raw.id);
  const overlayEntry = plOverlay[catalogSlug];
  const namePl = overlayEntry?.name ?? null;
  const aliases = Array.from(new Set(overlayEntry?.aliases ?? []));

  const primaryMuscles = [...raw.primaryMuscles].map((m) => normalizeMuscle(m, raw.id)).sort();
  const secondaryMuscles = [...raw.secondaryMuscles].map((m) => normalizeMuscle(m, raw.id)).sort();
  const equipmentSlug = normalizeEquipment(raw.equipment, raw.id);
  const bodyPart = primaryMuscles[0] ? (MUSCLE_TO_BODY_PART[primaryMuscles[0]] ?? null) : null;
  const category = raw.category?.trim() || null;
  const trackingType = deriveTrackingType(category);

  const nameSearch = foldDiacritics(
    [raw.name, namePl, ...aliases]
      .filter((value): value is string => Boolean(value && value.trim()))
      .join(' '),
  );

  return {
    catalogSlug,
    nameEn: raw.name.trim(),
    namePl,
    nameSearch,
    aliases,
    category,
    force: normalizeForce(raw.force),
    mechanic: normalizeMechanic(raw.mechanic),
    level: normalizeLevel(raw.level),
    equipmentSlug,
    bodyPart,
    trackingType,
    instructions: raw.instructions.map((line) => line.trim()).filter(Boolean),
    images: [...images],
    primaryMuscles,
    secondaryMuscles,
  };
}

/* ------------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------------ */

async function main(): Promise<void> {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  console.log('[build-catalog] fetching upstream dataset...');
  const upstreamBuffer = await fetchBufferWithRetry(UPSTREAM_DATASET_URL);
  const upstreamJson: unknown = JSON.parse(upstreamBuffer.toString('utf8'));
  const upstream = UpstreamDatasetSchema.parse(upstreamJson);
  console.log(`[build-catalog] fetched ${upstream.length} upstream exercises`);

  const plOverlay = loadOrCreateOverlay(PL_OVERLAY_PATH, PlOverlaySchema, {});
  loadOrCreateOverlay(VIDEOS_OVERLAY_PATH, VideoOverlaySchema, {});

  console.log('[build-catalog] downloading and bundling imagery (this may take a few minutes)...');
  const imagesByExerciseId = await bundleAllImages(upstream);

  let exercisesWithNoImages = 0;
  const catalogExercises: CatalogExercise[] = upstream.map((raw) => {
    const images = imagesByExerciseId.get(raw.id) ?? [];
    if (images.length === 0) exercisesWithNoImages++;
    return buildCatalogExercise(raw, plOverlay, images);
  });

  const seenSlugs = new Set<string>();
  for (const exercise of catalogExercises) {
    if (seenSlugs.has(exercise.catalogSlug)) {
      throw new Error(
        `catalogSlug collision: "${exercise.catalogSlug}" was produced by more than one upstream exercise id`,
      );
    }
    seenSlugs.add(exercise.catalogSlug);
  }

  catalogExercises.sort((a, b) => a.catalogSlug.localeCompare(b.catalogSlug));

  const catalogFile = CatalogFileSchema.parse({
    catalogVersion: CATALOG_VERSION,
    exercises: catalogExercises,
  });

  fs.writeFileSync(CATALOG_OUTPUT_PATH, `${JSON.stringify(catalogFile, null, 2)}\n`);

  const bundledImageFileCount = fs
    .readdirSync(IMAGES_DIR)
    .filter((name) => name.endsWith('.webp')).length;

  console.log(
    `[build-catalog] wrote ${catalogFile.exercises.length} exercises to ${path.relative(REPO_ROOT, CATALOG_OUTPUT_PATH)}`,
  );
  console.log(
    `[build-catalog] ${bundledImageFileCount} unique bundled image files in ${path.relative(REPO_ROOT, IMAGES_DIR)}`,
  );
  if (exercisesWithNoImages > 0) {
    console.warn(
      `[build-catalog] ${exercisesWithNoImages} exercises ended up with an empty images array`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(
    '[build-catalog] FAILED:',
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
  process.exitCode = 1;
});
