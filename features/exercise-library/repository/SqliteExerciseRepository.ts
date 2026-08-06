import type { SqlExecutor, SqlParam } from '@/repositories/contracts/database';
import type { EntityId } from '@/repositories/contracts/repository';
import {
  BaseSqliteRepository,
  RepositoryNotFoundError,
  type AuditedRow,
} from '@/repositories/base';
import {
  and,
  buildLimitOffset,
  eq,
  inList,
  isNull,
  toWhereSql,
  type WhereClause,
} from '@/repositories/query';
import { boolFromSql, boolToSql, jsonFromSql, jsonToSql } from '@/repositories/mapping';
import { seedCatalog, type CatalogExerciseEntry } from '@/database/seed/catalogSeeder';
import { ExerciseNotEditableError } from './errors';
import type {
  CreateCustomExerciseInput,
  Exercise,
  ExerciseContext,
  ExerciseListItem,
  ExerciseMuscleRef,
  ExerciseQuery,
  ExerciseRepository,
  ExerciseTrackingType,
  ExerciseUserData,
  ExerciseVideo,
  PlanReference,
  UpdateCustomExercisePatch,
} from './ExerciseRepository';

interface ExerciseRow extends AuditedRow {
  source: 'catalog' | 'custom';
  catalog_slug: string | null;
  name_en: string;
  name_pl: string | null;
  name_search: string;
  aliases: string;
  category: string | null;
  force: 'push' | 'pull' | 'static' | null;
  mechanic: 'compound' | 'isolation' | null;
  level: 'beginner' | 'intermediate' | 'expert' | null;
  equipment_slug: string | null;
  body_part: string | null;
  tracking_type: ExerciseTrackingType;
  instructions: string;
  images: string;
}

interface ExerciseListRow {
  id: string;
  source: 'catalog' | 'custom';
  catalog_slug: string | null;
  name_en: string;
  name_pl: string | null;
  level: 'beginner' | 'intermediate' | 'expert' | null;
  equipment_slug: string | null;
  body_part: string | null;
  tracking_type: ExerciseTrackingType;
  images: string;
  ud_is_favorite: number;
  ud_display_name_override: string | null;
}

interface ExerciseVideoRow {
  id: string;
  url: string;
  title: string;
  channel: string | null;
  language: 'en' | 'pl';
  source: 'curated' | 'user';
  sort_order: number;
}

interface ExerciseUserDataRow {
  exercise_id: string;
  is_favorite: number;
  favorited_at: number | null;
  note: string | null;
  default_rest_seconds: number | null;
  display_name_override: string | null;
  last_performed_at: number | null;
}

/** One row's worth of `exercise_fts`-indexed values - see `removeFromFts()`'s doc comment for why this needs to be captured explicitly. */
interface FtsSnapshot {
  rowid: number;
  nameEn: string;
  namePl: string | null;
  aliases: string;
  equipmentSlug: string | null;
  muscles: string;
}

const DEFAULT_USER_DATA: ExerciseUserData = {
  isFavorite: false,
  favoritedAt: null,
  note: null,
  defaultRestSeconds: null,
  displayNameOverride: null,
  lastPerformedAt: null,
};

/** Lowercased, diacritic-folded `name_search` - mirrors what `scripts/build-catalog.ts` precomputes for catalog rows, computed here at write time for custom ones. */
function buildNameSearch(
  nameEn: string,
  namePl: string | null | undefined,
  aliases: readonly string[],
): string {
  const parts = [nameEn, namePl ?? '', ...aliases].filter((part) => part.length > 0);
  return foldDiacritics(parts.join(' ').toLowerCase());
}

function foldDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Builds an FTS5 MATCH query: each whitespace-separated token becomes a quoted
 * prefix term (`"bench"*`), AND-combined by FTS5's default adjacency operator.
 * Every token is quoted (rather than passed as a bareword) so punctuation in a
 * user's search text (`"3/4"`, `-`, `:`) never collides with FTS5's own query
 * syntax - the diacritic folding itself is handled by the `remove_diacritics 2`
 * tokenizer configured on `exercise_fts` (ADR-0003), applied identically to both
 * indexed content and this query string, not by anything done here.
 */
function buildFtsMatchQuery(text: string): string {
  const tokens = text
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
  return tokens.map((token) => `"${token.replace(/"/g, '""')}"*`).join(' ');
}

function mapListRow(row: ExerciseListRow): ExerciseListItem {
  const images = jsonFromSql<string[]>(row.images, []);
  return {
    id: row.id,
    source: row.source,
    catalogSlug: row.catalog_slug,
    nameEn: row.name_en,
    namePl: row.name_pl,
    displayNameOverride: row.ud_display_name_override,
    level: row.level,
    equipmentSlug: row.equipment_slug,
    bodyPart: row.body_part,
    trackingType: row.tracking_type,
    primaryImage: images[0] ?? null,
    isFavorite: boolFromSql(row.ud_is_favorite),
  };
}

function mapVideoRow(row: ExerciseVideoRow): ExerciseVideo {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    channel: row.channel,
    language: row.language,
    source: row.source,
    sortOrder: row.sort_order,
  };
}

/**
 * SQLite implementation of `ExerciseRepository` (ARCHITECTURE.md section 8.3).
 * Extends `BaseSqliteRepository<Exercise, ExerciseRow>` for the mechanics that fit
 * a UUID-keyed, soft-deletable table exactly: id generation and audit stamping in
 * `createCustom` (via `insertRow`), `updateCustom` (via `updateRow`), and
 * `deleteCustom` (via `softDelete`).
 *
 * What it does NOT use from the base class is the generic `findById`: that method
 * maps a single raw row synchronously via `mapRow`, but `Exercise`'s detail shape
 * (ARCHITECTURE.md 8.3: "with muscles, videos, user data") requires additional
 * async joins `mapRow` cannot perform by itself. `mapRow` here instead produces a
 * "shell" `Exercise` from the raw `exercise` row alone (`muscles: []`, `videos: []`,
 * `userData` at its schema defaults); `hydrate()` is the async step that fills those
 * in, and every public read method (`findById`, `findByCatalogSlug`, and the
 * post-write reads inside `createCustom`/`updateCustom`) calls `mapRow` then
 * `hydrate` together rather than relying on the base class's own `findById`.
 */
export class SqliteExerciseRepository
  extends BaseSqliteRepository<Exercise, ExerciseRow>
  implements ExerciseRepository
{
  protected readonly table = 'exercise';

  protected mapRow(row: ExerciseRow): Exercise {
    return {
      id: row.id,
      source: row.source,
      catalogSlug: row.catalog_slug,
      nameEn: row.name_en,
      namePl: row.name_pl,
      nameSearch: row.name_search,
      aliases: jsonFromSql<string[]>(row.aliases, []),
      category: row.category,
      force: row.force,
      mechanic: row.mechanic,
      level: row.level,
      equipmentSlug: row.equipment_slug,
      bodyPart: row.body_part,
      trackingType: row.tracking_type,
      instructions: jsonFromSql<string[]>(row.instructions, []),
      images: jsonFromSql<string[]>(row.images, []),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      muscles: [],
      videos: [],
      userData: DEFAULT_USER_DATA,
    };
  }

  private async hydrate(exercise: Exercise, executor: SqlExecutor): Promise<Exercise> {
    const [muscles, videos, userData] = await Promise.all([
      this.loadMuscles(exercise.id, executor),
      this.loadVideos(exercise.id, executor),
      this.loadUserData(exercise.id, executor),
    ]);
    return { ...exercise, muscles, videos, userData };
  }

  private async loadMuscles(id: EntityId, executor: SqlExecutor): Promise<ExerciseMuscleRef[]> {
    const rows = await executor.select<{ muscle_slug: string; role: 'primary' | 'secondary' }>(
      'SELECT muscle_slug, role FROM exercise_muscle WHERE exercise_id = ? ORDER BY role, muscle_slug',
      [id],
    );
    return rows.map((row) => ({ slug: row.muscle_slug, role: row.role }));
  }

  private async loadVideos(id: EntityId, executor: SqlExecutor): Promise<ExerciseVideo[]> {
    const rows = await executor.select<ExerciseVideoRow>(
      'SELECT * FROM exercise_video WHERE exercise_id = ? AND deleted_at IS NULL ORDER BY sort_order',
      [id],
    );
    return rows.map(mapVideoRow);
  }

  private async loadUserData(id: EntityId, executor: SqlExecutor): Promise<ExerciseUserData> {
    const row = await executor.selectOne<ExerciseUserDataRow>(
      'SELECT * FROM exercise_user_data WHERE exercise_id = ?',
      [id],
    );
    if (!row) {
      return DEFAULT_USER_DATA;
    }
    return {
      isFavorite: boolFromSql(row.is_favorite),
      favoritedAt: row.favorited_at,
      note: row.note,
      defaultRestSeconds: row.default_rest_seconds,
      displayNameOverride: row.display_name_override,
      lastPerformedAt: row.last_performed_at,
    };
  }

  async findById(id: EntityId, tx?: SqlExecutor): Promise<Exercise | null> {
    const executor = this.executor(tx);
    const row = await executor.selectOne<ExerciseRow>(
      'SELECT * FROM exercise WHERE id = ? AND deleted_at IS NULL',
      [id],
    );
    if (!row) {
      return null;
    }
    return this.hydrate(this.mapRow(row), executor);
  }

  async findByCatalogSlug(slug: string, tx?: SqlExecutor): Promise<Exercise | null> {
    const executor = this.executor(tx);
    const row = await executor.selectOne<ExerciseRow>(
      'SELECT * FROM exercise WHERE catalog_slug = ? AND deleted_at IS NULL',
      [slug],
    );
    if (!row) {
      return null;
    }
    return this.hydrate(this.mapRow(row), executor);
  }

  /**
   * Per ADR-0003: an empty/whitespace-only `text` skips FTS entirely and runs a
   * plain filtered `SELECT`, `ORDER BY is_favorite DESC, name_en`. A non-empty
   * `text` runs the FTS5 MATCH query joined back to `exercise`/`exercise_user_data`
   * by rowid, `ORDER BY is_favorite DESC, rank, name_en`, with the same filter
   * `WHERE` clauses ANDed in either way. `muscleSlugs`/`equipmentSlugs` are
   * OR-within-category (an `IN`/`EXISTS`), AND-across-categories (confirmed with
   * the product owner, not assumed).
   */
  async search(query: ExerciseQuery, tx?: SqlExecutor): Promise<ExerciseListItem[]> {
    const executor = this.executor(tx);
    const filter = this.buildFilterClause(query);
    const pagination: Partial<{ limit: number; offset: number }> = {};
    if (query.limit !== undefined) pagination.limit = query.limit;
    if (query.offset !== undefined) pagination.offset = query.offset;
    const { sql: limitSql, params: limitParams } = buildLimitOffset(pagination);
    const text = query.text?.trim();

    if (!text) {
      const sql = `
        SELECT e.*, COALESCE(ud.is_favorite, 0) AS ud_is_favorite, ud.display_name_override AS ud_display_name_override
        FROM exercise e
        LEFT JOIN exercise_user_data ud ON ud.exercise_id = e.id
        ${toWhereSql(filter)}
        ORDER BY COALESCE(ud.is_favorite, 0) DESC, e.name_en ASC
        ${limitSql}
      `;
      const rows = await executor.select<ExerciseListRow>(sql, [...filter.params, ...limitParams]);
      return rows.map(mapListRow);
    }

    const matchQuery = buildFtsMatchQuery(text);
    const sql = `
      SELECT e.*, COALESCE(ud.is_favorite, 0) AS ud_is_favorite, ud.display_name_override AS ud_display_name_override
      FROM exercise_fts fts
      JOIN exercise e ON e.rowid = fts.rowid
      LEFT JOIN exercise_user_data ud ON ud.exercise_id = e.id
      WHERE exercise_fts MATCH ? AND ${filter.sql}
      ORDER BY COALESCE(ud.is_favorite, 0) DESC, fts.rank ASC, e.name_en ASC
      ${limitSql}
    `;
    const rows = await executor.select<ExerciseListRow>(sql, [
      matchQuery,
      ...filter.params,
      ...limitParams,
    ]);
    return rows.map(mapListRow);
  }

  private buildFilterClause(query: ExerciseQuery): WhereClause {
    const clauses: (WhereClause | null)[] = [isNull('e.deleted_at')];

    if (query.muscleSlugs && query.muscleSlugs.length > 0) {
      clauses.push({
        sql: `EXISTS (SELECT 1 FROM exercise_muscle em WHERE em.exercise_id = e.id AND em.muscle_slug IN (${query.muscleSlugs
          .map(() => '?')
          .join(', ')}))`,
        params: query.muscleSlugs,
      });
    }
    if (query.equipmentSlugs && query.equipmentSlugs.length > 0) {
      clauses.push(inList('e.equipment_slug', query.equipmentSlugs));
    }
    if (query.bodyParts && query.bodyParts.length > 0) {
      clauses.push(inList('e.body_part', query.bodyParts));
    }
    if (query.level) {
      clauses.push(eq('e.level', query.level));
    }
    if (query.favoritesOnly) {
      clauses.push({ sql: 'COALESCE(ud.is_favorite, 0) = 1', params: [] });
    }
    if (query.source) {
      clauses.push(eq('e.source', query.source));
    }
    if (query.context) {
      clauses.push(this.buildContextClause(query.context));
    }

    return and(...clauses);
  }

  private buildContextClause(context: ExerciseContext): WhereClause {
    const column = context === 'gym' ? 'is_gym' : 'is_home';
    return {
      sql: `e.equipment_slug IN (SELECT slug FROM equipment WHERE ${column} = 1)`,
      params: [],
    };
  }

  async createCustom(input: CreateCustomExerciseInput, tx?: SqlExecutor): Promise<Exercise> {
    const runner = async (t: SqlExecutor): Promise<Exercise> => {
      const nameSearch = buildNameSearch(input.nameEn, input.namePl, input.aliases ?? []);
      const { id } = await this.insertRow(
        {
          source: 'custom',
          catalog_slug: null,
          name_en: input.nameEn,
          name_pl: input.namePl ?? null,
          name_search: nameSearch,
          aliases: jsonToSql(input.aliases ?? []),
          category: input.category ?? null,
          force: input.force ?? null,
          mechanic: input.mechanic ?? null,
          level: input.level ?? null,
          equipment_slug: input.equipmentSlug ?? null,
          body_part: input.bodyPart ?? null,
          tracking_type: input.trackingType ?? 'weight_reps',
          instructions: jsonToSql(input.instructions ?? []),
          images: jsonToSql(input.images ?? []),
        },
        t,
      );
      await this.replaceMuscles(id, input.muscles ?? [], t);
      // No prior FTS entry exists for a brand-new row - nothing to remove first.
      await this.insertIntoFts(id, t);

      const created = await this.findById(id, t);
      if (!created) {
        throw new Error('unreachable: exercise row was just inserted');
      }
      return created;
    };

    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  async updateCustom(
    id: EntityId,
    patch: UpdateCustomExercisePatch,
    tx?: SqlExecutor,
  ): Promise<Exercise> {
    const runner = async (t: SqlExecutor): Promise<Exercise> => {
      const existingRow = await t.selectOne<ExerciseRow>(
        'SELECT * FROM exercise WHERE id = ? AND deleted_at IS NULL',
        [id],
      );
      if (!existingRow) {
        throw new RepositoryNotFoundError(this.table, id);
      }
      if (existingRow.source !== 'custom') {
        throw new ExerciseNotEditableError(id);
      }
      // Snapshotted before any mutation below - a contentless FTS5 table's
      // 'delete' command needs the exact values currently in the index to
      // remove the right posting-list entries (see `removeFromFts()`'s doc
      // comment).
      const previousFts = await this.captureFtsSnapshot(id, t);

      const columns: Record<string, SqlParam> = {};
      const touchesName =
        patch.nameEn !== undefined || patch.namePl !== undefined || patch.aliases !== undefined;

      if (patch.nameEn !== undefined) columns.name_en = patch.nameEn;
      if (patch.namePl !== undefined) columns.name_pl = patch.namePl;
      if (patch.aliases !== undefined) columns.aliases = jsonToSql(patch.aliases);
      if (touchesName) {
        const nextNameEn = patch.nameEn ?? existingRow.name_en;
        const nextNamePl = patch.namePl !== undefined ? patch.namePl : existingRow.name_pl;
        const nextAliases =
          patch.aliases !== undefined
            ? patch.aliases
            : jsonFromSql<string[]>(existingRow.aliases, []);
        columns.name_search = buildNameSearch(nextNameEn, nextNamePl, nextAliases);
      }
      if (patch.category !== undefined) columns.category = patch.category;
      if (patch.force !== undefined) columns.force = patch.force;
      if (patch.mechanic !== undefined) columns.mechanic = patch.mechanic;
      if (patch.level !== undefined) columns.level = patch.level;
      if (patch.equipmentSlug !== undefined) columns.equipment_slug = patch.equipmentSlug;
      if (patch.bodyPart !== undefined) columns.body_part = patch.bodyPart;
      if (patch.trackingType !== undefined) columns.tracking_type = patch.trackingType;
      if (patch.instructions !== undefined) columns.instructions = jsonToSql(patch.instructions);
      if (patch.images !== undefined) columns.images = jsonToSql(patch.images);

      if (Object.keys(columns).length > 0) {
        await this.updateRow(id, columns, t);
      }
      if (patch.muscles !== undefined) {
        await this.replaceMuscles(id, patch.muscles, t);
      }
      if (previousFts) {
        await this.removeFromFts(previousFts, t);
      }
      await this.insertIntoFts(id, t);

      const updated = await this.findById(id, t);
      if (!updated) {
        throw new Error('unreachable: exercise row was just updated');
      }
      return updated;
    };

    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  async deleteCustom(id: EntityId, tx?: SqlExecutor): Promise<void> {
    const runner = async (t: SqlExecutor): Promise<void> => {
      const existing = await t.selectOne<{ source: 'catalog' | 'custom' }>(
        'SELECT source FROM exercise WHERE id = ? AND deleted_at IS NULL',
        [id],
      );
      if (!existing) {
        throw new RepositoryNotFoundError(this.table, id);
      }
      if (existing.source !== 'custom') {
        throw new ExerciseNotEditableError(id);
      }
      const previousFts = await this.captureFtsSnapshot(id, t);
      await this.softDelete(id, t);
      if (previousFts) {
        await this.removeFromFts(previousFts, t);
      }
    };

    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  async setFavorite(id: EntityId, value: boolean, tx?: SqlExecutor): Promise<void> {
    await this.upsertUserDataColumns(
      id,
      { is_favorite: boolToSql(value), favorited_at: value ? this.now() : null },
      tx,
    );
  }

  async setNote(id: EntityId, note: string | null, tx?: SqlExecutor): Promise<void> {
    await this.upsertUserDataColumns(id, { note }, tx);
  }

  async setDefaultRest(id: EntityId, seconds: number | null, tx?: SqlExecutor): Promise<void> {
    await this.upsertUserDataColumns(id, { default_rest_seconds: seconds }, tx);
  }

  /**
   * Partial-update-or-insert-with-defaults for `exercise_user_data`: an existing
   * row gets only the given columns updated (so `setFavorite` never clobbers a
   * previously-set `note`, and vice versa); a missing row is inserted with schema
   * defaults for every column *except* the ones being set right now.
   */
  private async upsertUserDataColumns(
    id: EntityId,
    columns: Record<string, SqlParam>,
    tx?: SqlExecutor,
  ): Promise<void> {
    const executor = this.executor(tx);
    const now = this.now();

    const existing = await executor.selectOne<{ exercise_id: string }>(
      'SELECT exercise_id FROM exercise_user_data WHERE exercise_id = ?',
      [id],
    );

    if (existing) {
      const entries = Object.entries(columns);
      const assignments = entries.map(([name]) => `${name} = ?`).join(', ');
      await executor.run(
        `UPDATE exercise_user_data SET ${assignments}, updated_at = ? WHERE exercise_id = ?`,
        [...entries.map(([, value]) => value), now, id],
      );
      return;
    }

    const exerciseRow = await executor.selectOne<{ id: string }>(
      'SELECT id FROM exercise WHERE id = ? AND deleted_at IS NULL',
      [id],
    );
    if (!exerciseRow) {
      throw new RepositoryNotFoundError('exercise', id);
    }

    const defaults: Record<string, SqlParam> = {
      is_favorite: 0,
      favorited_at: null,
      note: null,
      default_rest_seconds: null,
      display_name_override: null,
    };
    const merged = { ...defaults, ...columns };
    const columnNames = ['exercise_id', ...Object.keys(merged), 'created_at', 'updated_at'];
    const params: SqlParam[] = [id, ...Object.values(merged), now, now];
    await executor.run(
      `INSERT INTO exercise_user_data (${columnNames.join(', ')}) VALUES (${columnNames.map(() => '?').join(', ')})`,
      params,
    );
  }

  async listReferencingPlans(id: EntityId, tx?: SqlExecutor): Promise<PlanReference[]> {
    const executor = this.executor(tx);
    const rows = await executor.select<{ plan_id: string; plan_name: string }>(
      `SELECT DISTINCT p.id AS plan_id, p.name AS plan_name
       FROM plan_day_exercise pde
       JOIN plan_day pd ON pd.id = pde.plan_day_id AND pd.deleted_at IS NULL
       JOIN plan p ON p.id = pd.plan_id AND p.deleted_at IS NULL
       WHERE pde.exercise_id = ? AND pde.deleted_at IS NULL
       ORDER BY p.name`,
      [id],
    );
    return rows.map((row) => ({ planId: row.plan_id, planName: row.plan_name }));
  }

  /**
   * Thin wrapper delegating to `catalogSeeder.seedCatalog()` - does not reimplement
   * catalog upsert logic. `seedCatalog()` always runs inside its own
   * `db.transaction()` call (it needs `DatabaseContext`, not just `SqlExecutor`, to
   * do that), so unlike every other method here, `replaceCatalog` cannot honor a
   * caller-supplied `tx` and does not accept one - matching the literal
   * `replaceCatalog(entries, catalogVersion): Promise<void>` signature from
   * ARCHITECTURE.md section 8.3, which likewise shows no `tx` parameter.
   */
  async replaceCatalog(
    entries: readonly CatalogExerciseEntry[],
    catalogVersion: string,
  ): Promise<void> {
    await seedCatalog(this.deps.db, { catalogVersion, exercises: [...entries] });
  }

  private async replaceMuscles(
    id: EntityId,
    muscles: readonly ExerciseMuscleRef[],
    tx: SqlExecutor,
  ): Promise<void> {
    await tx.run('DELETE FROM exercise_muscle WHERE exercise_id = ?', [id]);
    for (const muscle of muscles) {
      await tx.run(
        'INSERT INTO exercise_muscle (exercise_id, muscle_slug, role) VALUES (?, ?, ?)',
        [id, muscle.slug, muscle.role],
      );
    }
  }

  /**
   * Maintains `exercise_fts` for exactly one row, inside the caller's transaction -
   * per ADR-0003 and the `schema.sql` comment on `exercise_fts` ("maintained by the
   * ExerciseRepository inside the same transaction as any exercise write"). Never a
   * wholesale rebuild (that's `replaceCatalog`'s job only, via `seedCatalog()`).
   *
   * Contentless FTS5 tables have no `UPDATE`; a single-row upsert is `DELETE ...
   * WHERE rowid = ?` followed by `INSERT ... (rowid, ...) VALUES (?, ...)` - both
   * valid, documented FTS5 operations on a contentless table, bound to `exercise`'s
   * own implicit SQLite `rowid` (mirrors `rebuildExerciseFts()` in
   * `catalogSeeder.ts`, just scoped to one row instead of every row). A
   * soft-deleted row is removed from the index and never reinserted.
   */
  /**
   * Reads the current `exercise`/`exercise_muscle` values for one row, in exactly
   * the shape they are (or would be) indexed in `exercise_fts` - used both to
   * insert a fresh index entry and, captured *before* a mutation, to later remove
   * the entry that mutation is about to invalidate (see `removeFromFts()`).
   */
  private async captureFtsSnapshot(id: EntityId, tx: SqlExecutor): Promise<FtsSnapshot | null> {
    const row = await tx.selectOne<{
      rowid: number;
      name_en: string;
      name_pl: string | null;
      aliases: string;
      equipment_slug: string | null;
      muscles: string;
    }>(
      `SELECT e.rowid AS rowid, e.name_en, e.name_pl, e.aliases, e.equipment_slug,
              COALESCE((SELECT group_concat(em.muscle_slug, ' ') FROM exercise_muscle em WHERE em.exercise_id = e.id), '') AS muscles
       FROM exercise e
       WHERE e.id = ?`,
      [id],
    );
    if (!row) {
      return null;
    }
    return {
      rowid: row.rowid,
      nameEn: row.name_en,
      namePl: row.name_pl,
      aliases: row.aliases,
      equipmentSlug: row.equipment_slug,
      muscles: row.muscles,
    };
  }

  /**
   * Removes one row from the contentless `exercise_fts` index - per ADR-0003 and
   * the `schema.sql` comment on `exercise_fts` ("maintained by the
   * ExerciseRepository inside the same transaction as any exercise write"), never
   * a wholesale rebuild (that's `replaceCatalog`'s job only, via `seedCatalog()`).
   *
   * A plain `DELETE FROM exercise_fts WHERE rowid = ?` is **not** valid on a
   * contentless FTS5 table (`content = ''`) - confirmed empirically (it throws
   * `cannot DELETE from contentless fts5 table`), not assumed from the docs alone.
   * Contentless tables store no column data, only the inverted index, so removing
   * a row requires FTS5's special `'delete'` command with the *exact* column
   * values currently indexed, which is why every call site captures a
   * `FtsSnapshot` via `captureFtsSnapshot()` before mutating the row it describes.
   */
  private async removeFromFts(snapshot: FtsSnapshot, tx: SqlExecutor): Promise<void> {
    await tx.run(
      `INSERT INTO exercise_fts (exercise_fts, rowid, name_en, name_pl, aliases, equipment_slug, muscles)
       VALUES ('delete', ?, ?, ?, ?, ?, ?)`,
      [
        snapshot.rowid,
        snapshot.nameEn,
        snapshot.namePl,
        snapshot.aliases,
        snapshot.equipmentSlug,
        snapshot.muscles,
      ],
    );
  }

  /** Inserts a fresh `exercise_fts` entry from the row's current values. No-op if the row no longer exists (e.g. raced with a delete). */
  private async insertIntoFts(id: EntityId, tx: SqlExecutor): Promise<void> {
    const snapshot = await this.captureFtsSnapshot(id, tx);
    if (!snapshot) {
      return;
    }
    await tx.run(
      'INSERT INTO exercise_fts (rowid, name_en, name_pl, aliases, equipment_slug, muscles) VALUES (?, ?, ?, ?, ?, ?)',
      [
        snapshot.rowid,
        snapshot.nameEn,
        snapshot.namePl,
        snapshot.aliases,
        snapshot.equipmentSlug,
        snapshot.muscles,
      ],
    );
  }
}
