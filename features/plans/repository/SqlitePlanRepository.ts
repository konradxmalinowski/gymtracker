import type { SqlExecutor, SqlParam } from '@/repositories/contracts/database';
import type { EntityId } from '@/repositories/contracts/repository';
import { BaseSqliteRepository, RepositoryNotFoundError, type AuditedRow } from '@/repositories/base';
import { boolFromSql, jsonFromSql } from '@/repositories/mapping';
import type { ExerciseListItem, ExerciseLevel, ExerciseTrackingType } from '@/features/exercise-library';
import { SupersetSpansMultipleDaysError } from './errors';
import type {
  AddPlanDayExerciseInput,
  AddPlanDayInput,
  CreatePlanInput,
  PlanAggregate,
  PlanDay,
  PlanDayExercise,
  PlanListItem,
  PlanRepository,
  UpdatePlanDayExercisePatch,
} from './PlanRepository';

interface PlanRow extends AuditedRow {
  name: string;
  description: string | null;
  color: string | null;
  is_active: number;
  sort_order: number;
}

interface PlanListRow extends PlanRow {
  day_count: number;
}

interface PlanDayRow {
  id: string;
  plan_id: string;
  name: string;
  note: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

interface PlanDayExerciseRow {
  id: string;
  plan_day_id: string;
  exercise_id: string;
  sort_order: number;
  target_sets: number | null;
  target_rep_min: number | null;
  target_rep_max: number | null;
  target_rpe: number | null;
  rest_seconds: number | null;
  superset_group: number | null;
  note: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

/** Enough of `exercise`/`exercise_user_data` to build an `ExerciseListItem` - mirrors `SqliteExerciseRepository`'s own `ExerciseListRow`/`mapListRow` exactly, so the two stay in sync if that shape ever changes. */
interface ExerciseSummaryRow {
  id: string;
  source: 'catalog' | 'custom';
  catalog_slug: string | null;
  name_en: string;
  name_pl: string | null;
  level: ExerciseLevel | null;
  equipment_slug: string | null;
  body_part: string | null;
  tracking_type: ExerciseTrackingType;
  images: string;
  ud_is_favorite: number;
  ud_display_name_override: string | null;
}

type PlanChildTable = 'plan_day' | 'plan_day_exercise';

function mapPlanRow(row: PlanRow): Omit<PlanAggregate, 'days'> {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    isActive: boolFromSql(row.is_active),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapExerciseSummaryRow(row: ExerciseSummaryRow): ExerciseListItem {
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

/**
 * SQLite implementation of `PlanRepository` (ARCHITECTURE.md section 8.3).
 * Extends `BaseSqliteRepository<PlanAggregate, PlanRow>` scoped to the `plan`
 * table only - `insertRow`/`updateRow`/`softDelete`/`restore`/`purge` all
 * operate on `plan` and back `createPlan`/`renamePlan`/`deletePlan`/
 * `restorePlan`/`purgePlan` directly. `plan_day` and `plan_day_exercise` are
 * a different table each, which the shared base class (deliberately scoped
 * to one `table` per instance) has no mechanism for - `insertInto`/
 * `updateRowIn`/`softDeleteRow` below are this class's own small,
 * table-parameterized equivalents of the base class's `insertRow`/
 * `updateRow`/`softDelete`, used only for those two tables. The table name
 * passed to them is always one of this file's own hardcoded literals, never
 * caller input - the same interpolation-safety reasoning `BaseSqliteRepository`
 * itself documents for `this.table`.
 *
 * Like `SqliteExerciseRepository`, this class does not lean on the inherited
 * `findById`: `PlanAggregate`'s "plan + days + day exercises + exercise
 * summaries" shape needs async joins `mapRow` cannot perform alone. `mapRow`
 * produces a `days: []` shell; `getPlan()` is the async path that fills it in
 * via `loadDaysForPlan()`, which loads every day and every day-exercise (plus
 * every referenced exercise's summary) for the whole plan in three queries
 * total, not one query per day - the CQRS-lite "never load-all-then-loop"
 * rule from CLAUDE.md's data layer section, applied here to avoid an N+1 across
 * a plan's days.
 */
export class SqlitePlanRepository
  extends BaseSqliteRepository<PlanAggregate, PlanRow>
  implements PlanRepository
{
  protected readonly table = 'plan';

  protected mapRow(row: PlanRow): PlanAggregate {
    return { ...mapPlanRow(row), days: [] };
  }

  async listPlans(tx?: SqlExecutor): Promise<PlanListItem[]> {
    const executor = this.executor(tx);
    const rows = await executor.select<PlanListRow>(
      `SELECT p.*, COUNT(pd.id) AS day_count
       FROM plan p
       LEFT JOIN plan_day pd ON pd.plan_id = p.id AND pd.deleted_at IS NULL
       WHERE p.deleted_at IS NULL
       GROUP BY p.id
       ORDER BY p.sort_order ASC`,
    );
    return rows.map((row) => ({ ...mapPlanRow(row), dayCount: Number(row.day_count) }));
  }

  async getPlan(id: EntityId, tx?: SqlExecutor): Promise<PlanAggregate | null> {
    const executor = this.executor(tx);
    const row = await executor.selectOne<PlanRow>(
      'SELECT * FROM plan WHERE id = ? AND deleted_at IS NULL',
      [id],
    );
    if (!row) {
      return null;
    }
    const days = await this.loadDaysForPlan(id, executor);
    return { ...mapPlanRow(row), days };
  }

  async createPlan(input: CreatePlanInput, tx?: SqlExecutor): Promise<PlanAggregate> {
    const runner = async (t: SqlExecutor): Promise<PlanAggregate> => {
      const sortOrder = await this.nextSortOrder('plan', '1=1', [], t);
      const { id } = await this.insertRow(
        {
          name: input.name,
          description: input.description ?? null,
          color: input.color ?? null,
          is_active: 0,
          sort_order: sortOrder,
        },
        t,
      );
      const created = await this.getPlan(id, t);
      if (!created) {
        throw new Error('unreachable: plan row was just inserted');
      }
      return created;
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  async renamePlan(id: EntityId, name: string, tx?: SqlExecutor): Promise<void> {
    await this.updateRow(id, { name }, tx);
  }

  /**
   * Deep copy: a new `plan` row plus a new `plan_day` row for every original
   * day and a new `plan_day_exercise` row for every original day-exercise -
   * every one of those gets a freshly generated id, none shared with the
   * original (this phase's acceptance criterion, verified for a 4-day/
   * 24-exercise plan in the test file). `exercise_id` values are copied
   * as-is (exercises are referenced, never duplicated).
   *
   * Name disambiguation decision: this always appends exactly `" (copy)"`,
   * verbatim per the task brief. It does NOT detect an existing "(copy)"/
   * "(copy 2)" suffix and increment it - duplicating "Push Day" twice
   * produces two plans both named "Push Day (copy)". That disambiguation is
   * left to `PlanService`, which has to Zod-validate `name` anyway and is a
   * more natural place to own "check existing names and suffix a number" than
   * a repository whose other methods don't do any name-shaping at all.
   */
  async duplicatePlan(id: EntityId, tx?: SqlExecutor): Promise<PlanAggregate> {
    const runner = async (t: SqlExecutor): Promise<PlanAggregate> => {
      const original = await this.getPlan(id, t);
      if (!original) {
        throw new RepositoryNotFoundError('plan', id);
      }
      const sortOrder = await this.nextSortOrder('plan', '1=1', [], t);
      const { id: newPlanId } = await this.insertRow(
        {
          name: `${original.name} (copy)`,
          description: original.description,
          color: original.color,
          is_active: 0,
          sort_order: sortOrder,
        },
        t,
      );
      for (const day of original.days) {
        await this.copyDayInto(newPlanId, day, t);
      }
      const created = await this.getPlan(newPlanId, t);
      if (!created) {
        throw new Error('unreachable: plan row was just inserted');
      }
      return created;
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  private async copyDayInto(targetPlanId: EntityId, day: PlanDay, tx: SqlExecutor): Promise<void> {
    const { id: newDayId } = await this.insertInto(
      'plan_day',
      { plan_id: targetPlanId, name: day.name, note: day.note, sort_order: day.sortOrder },
      tx,
    );
    for (const dayExercise of day.exercises) {
      await this.insertInto(
        'plan_day_exercise',
        {
          plan_day_id: newDayId,
          exercise_id: dayExercise.exerciseId,
          sort_order: dayExercise.sortOrder,
          target_sets: dayExercise.targetSets,
          target_rep_min: dayExercise.targetRepMin,
          target_rep_max: dayExercise.targetRepMax,
          target_rpe: dayExercise.targetRpe,
          rest_seconds: dayExercise.restSeconds,
          superset_group: dayExercise.supersetGroup,
          note: dayExercise.note,
        },
        tx,
      );
    }
  }

  /**
   * Clears the previously active plan first, then activates the target -
   * both inside one transaction. That order matters: `ux_plan_single_active`
   * is a partial unique index checked per-statement, so clearing-then-setting
   * never has a committed (or even intra-transaction) moment with two active
   * rows. A moment with zero active rows between the two statements is fine -
   * the partial index only forbids more than one, not zero.
   */
  async setActivePlan(id: EntityId, tx?: SqlExecutor): Promise<void> {
    const runner = async (t: SqlExecutor): Promise<void> => {
      const now = this.now();
      await t.run(
        'UPDATE plan SET is_active = 0, updated_at = ? WHERE is_active = 1 AND id != ? AND deleted_at IS NULL',
        [now, id],
      );
      const result = await t.run(
        'UPDATE plan SET is_active = 1, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
        [now, id],
      );
      if (result.changes === 0) {
        throw new RepositoryNotFoundError('plan', id);
      }
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  async reorderPlans(orderedIds: readonly EntityId[], tx?: SqlExecutor): Promise<void> {
    const runner = async (t: SqlExecutor): Promise<void> => {
      const now = this.now();
      for (let index = 0; index < orderedIds.length; index += 1) {
        const result = await t.run(
          'UPDATE plan SET sort_order = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
          [index, now, orderedIds[index]!],
        );
        if (result.changes === 0) {
          throw new RepositoryNotFoundError('plan', orderedIds[index]!);
        }
      }
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  async addDay(planId: EntityId, input: AddPlanDayInput, tx?: SqlExecutor): Promise<PlanDay> {
    const runner = async (t: SqlExecutor): Promise<PlanDay> => {
      const plan = await t.selectOne<{ id: string }>(
        'SELECT id FROM plan WHERE id = ? AND deleted_at IS NULL',
        [planId],
      );
      if (!plan) {
        throw new RepositoryNotFoundError('plan', planId);
      }
      const sortOrder = await this.nextSortOrder('plan_day', 'plan_id = ?', [planId], t);
      const { id } = await this.insertInto(
        'plan_day',
        { plan_id: planId, name: input.name, note: input.note ?? null, sort_order: sortOrder },
        t,
      );
      const created = await this.loadDayById(id, t);
      if (!created) {
        throw new Error('unreachable: plan_day row was just inserted');
      }
      return created;
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  async renameDay(dayId: EntityId, name: string, tx?: SqlExecutor): Promise<void> {
    await this.updateRowIn('plan_day', dayId, { name }, this.executor(tx));
  }

  /** Deep copy within the same plan - new ids for the day and every one of its day-exercises, same `exercise_id`s. */
  async duplicateDay(dayId: EntityId, tx?: SqlExecutor): Promise<PlanDay> {
    const runner = async (t: SqlExecutor): Promise<PlanDay> => {
      const dayRow = await t.selectOne<PlanDayRow>(
        'SELECT * FROM plan_day WHERE id = ? AND deleted_at IS NULL',
        [dayId],
      );
      if (!dayRow) {
        throw new RepositoryNotFoundError('plan_day', dayId);
      }
      const original = await this.hydrateDay(dayRow, t);
      const sortOrder = await this.nextSortOrder('plan_day', 'plan_id = ?', [dayRow.plan_id], t);
      const { id: newDayId } = await this.insertInto(
        'plan_day',
        { plan_id: dayRow.plan_id, name: original.name, note: original.note, sort_order: sortOrder },
        t,
      );
      for (const dayExercise of original.exercises) {
        await this.insertInto(
          'plan_day_exercise',
          {
            plan_day_id: newDayId,
            exercise_id: dayExercise.exerciseId,
            sort_order: dayExercise.sortOrder,
            target_sets: dayExercise.targetSets,
            target_rep_min: dayExercise.targetRepMin,
            target_rep_max: dayExercise.targetRepMax,
            target_rpe: dayExercise.targetRpe,
            rest_seconds: dayExercise.restSeconds,
            superset_group: dayExercise.supersetGroup,
            note: dayExercise.note,
          },
          t,
        );
      }
      const created = await this.loadDayById(newDayId, t);
      if (!created) {
        throw new Error('unreachable: plan_day row was just inserted');
      }
      return created;
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  async deleteDay(dayId: EntityId, tx?: SqlExecutor): Promise<void> {
    await this.softDeleteRow('plan_day', dayId, this.executor(tx));
  }

  /** Undoes `deleteDay` - the day-level undo toast's call target (docs/ARCHITECTURE.md nav rules: delete-plus-undo-toast below plan level). */
  async restoreDay(dayId: EntityId, tx?: SqlExecutor): Promise<void> {
    await this.restoreRow('plan_day', dayId, this.executor(tx));
  }

  async reorderDays(
    planId: EntityId,
    orderedDayIds: readonly EntityId[],
    tx?: SqlExecutor,
  ): Promise<void> {
    const runner = async (t: SqlExecutor): Promise<void> => {
      const now = this.now();
      for (let index = 0; index < orderedDayIds.length; index += 1) {
        const result = await t.run(
          'UPDATE plan_day SET sort_order = ?, updated_at = ? WHERE id = ? AND plan_id = ? AND deleted_at IS NULL',
          [index, now, orderedDayIds[index]!, planId],
        );
        if (result.changes === 0) {
          throw new RepositoryNotFoundError('plan_day', orderedDayIds[index]!);
        }
      }
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  async addExerciseToDay(
    dayId: EntityId,
    input: AddPlanDayExerciseInput,
    tx?: SqlExecutor,
  ): Promise<PlanDayExercise> {
    const runner = async (t: SqlExecutor): Promise<PlanDayExercise> => {
      const day = await t.selectOne<{ id: string }>(
        'SELECT id FROM plan_day WHERE id = ? AND deleted_at IS NULL',
        [dayId],
      );
      if (!day) {
        throw new RepositoryNotFoundError('plan_day', dayId);
      }
      const sortOrder = await this.nextSortOrder('plan_day_exercise', 'plan_day_id = ?', [dayId], t);
      const { id } = await this.insertInto(
        'plan_day_exercise',
        {
          plan_day_id: dayId,
          exercise_id: input.exerciseId,
          sort_order: sortOrder,
          target_sets: input.targetSets ?? null,
          target_rep_min: input.targetRepMin ?? null,
          target_rep_max: input.targetRepMax ?? null,
          target_rpe: input.targetRpe ?? null,
          rest_seconds: input.restSeconds ?? null,
          superset_group: null,
          note: input.note ?? null,
        },
        t,
      );
      const row = await t.selectOne<PlanDayExerciseRow>(
        'SELECT * FROM plan_day_exercise WHERE id = ?',
        [id],
      );
      if (!row) {
        throw new Error('unreachable: plan_day_exercise row was just inserted');
      }
      const summaries = await this.loadExerciseSummaries([input.exerciseId], t);
      return this.mapDayExerciseRow(row, summaries);
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  async updateDayExercise(
    id: EntityId,
    patch: UpdatePlanDayExercisePatch,
    tx?: SqlExecutor,
  ): Promise<PlanDayExercise> {
    const runner = async (t: SqlExecutor): Promise<PlanDayExercise> => {
      const columns: Record<string, SqlParam> = {};
      if (patch.targetSets !== undefined) columns.target_sets = patch.targetSets;
      if (patch.targetRepMin !== undefined) columns.target_rep_min = patch.targetRepMin;
      if (patch.targetRepMax !== undefined) columns.target_rep_max = patch.targetRepMax;
      if (patch.targetRpe !== undefined) columns.target_rpe = patch.targetRpe;
      if (patch.restSeconds !== undefined) columns.rest_seconds = patch.restSeconds;
      if (patch.note !== undefined) columns.note = patch.note;

      if (Object.keys(columns).length > 0) {
        await this.updateRowIn('plan_day_exercise', id, columns, t);
      } else {
        const exists = await t.selectOne<{ id: string }>(
          'SELECT id FROM plan_day_exercise WHERE id = ? AND deleted_at IS NULL',
          [id],
        );
        if (!exists) {
          throw new RepositoryNotFoundError('plan_day_exercise', id);
        }
      }

      const row = await t.selectOne<PlanDayExerciseRow>(
        'SELECT * FROM plan_day_exercise WHERE id = ? AND deleted_at IS NULL',
        [id],
      );
      if (!row) {
        throw new Error('unreachable: plan_day_exercise row was just updated');
      }
      const summaries = await this.loadExerciseSummaries([row.exercise_id], t);
      return this.mapDayExerciseRow(row, summaries);
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  async removeExerciseFromDay(id: EntityId, tx?: SqlExecutor): Promise<void> {
    await this.softDeleteRow('plan_day_exercise', id, this.executor(tx));
  }

  /** Undoes `removeExerciseFromDay` - the day-exercise-level undo toast's call target. */
  async restoreDayExercise(id: EntityId, tx?: SqlExecutor): Promise<void> {
    await this.restoreRow('plan_day_exercise', id, this.executor(tx));
  }

  async reorderDayExercises(
    dayId: EntityId,
    orderedIds: readonly EntityId[],
    tx?: SqlExecutor,
  ): Promise<void> {
    const runner = async (t: SqlExecutor): Promise<void> => {
      const now = this.now();
      for (let index = 0; index < orderedIds.length; index += 1) {
        const result = await t.run(
          'UPDATE plan_day_exercise SET sort_order = ?, updated_at = ? WHERE id = ? AND plan_day_id = ? AND deleted_at IS NULL',
          [index, now, orderedIds[index]!, dayId],
        );
        if (result.changes === 0) {
          throw new RepositoryNotFoundError('plan_day_exercise', orderedIds[index]!);
        }
      }
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  /**
   * @throws {SupersetSpansMultipleDaysError} if the given ids don't all
   * belong to the same `plan_day` - this is the one invariant this method
   * enforces itself rather than deferring to `PlanService` (see this class's
   * own interface doc comment).
   */
  async setSupersetGroup(
    dayExerciseIds: readonly EntityId[],
    group: number | null,
    tx?: SqlExecutor,
  ): Promise<void> {
    const runner = async (t: SqlExecutor): Promise<void> => {
      if (dayExerciseIds.length === 0) {
        return;
      }
      const placeholders = dayExerciseIds.map(() => '?').join(', ');
      const rows = await t.select<{ id: string; plan_day_id: string }>(
        `SELECT id, plan_day_id FROM plan_day_exercise WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
        [...dayExerciseIds],
      );
      if (rows.length !== dayExerciseIds.length) {
        const found = new Set(rows.map((row) => row.id));
        const missing = dayExerciseIds.find((id) => !found.has(id));
        throw new RepositoryNotFoundError('plan_day_exercise', missing ?? dayExerciseIds[0]!);
      }
      const distinctDays = new Set(rows.map((row) => row.plan_day_id));
      if (distinctDays.size > 1) {
        throw new SupersetSpansMultipleDaysError(dayExerciseIds);
      }

      const now = this.now();
      await t.run(
        `UPDATE plan_day_exercise SET superset_group = ?, updated_at = ? WHERE id IN (${placeholders})`,
        [group, now, ...dayExerciseIds],
      );
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  async deletePlan(id: EntityId, tx?: SqlExecutor): Promise<void> {
    await this.softDelete(id, tx);
  }

  async restorePlan(id: EntityId, tx?: SqlExecutor): Promise<void> {
    await this.restore(id, tx);
  }

  async purgePlan(id: EntityId, tx?: SqlExecutor): Promise<void> {
    await this.purge(id, tx);
  }

  // --- day/day-exercise loading -------------------------------------------------

  private async loadDayById(id: EntityId, executor: SqlExecutor): Promise<PlanDay | null> {
    const row = await executor.selectOne<PlanDayRow>(
      'SELECT * FROM plan_day WHERE id = ? AND deleted_at IS NULL',
      [id],
    );
    if (!row) {
      return null;
    }
    return this.hydrateDay(row, executor);
  }

  private async hydrateDay(row: PlanDayRow, executor: SqlExecutor): Promise<PlanDay> {
    const exerciseRows = await executor.select<PlanDayExerciseRow>(
      'SELECT * FROM plan_day_exercise WHERE plan_day_id = ? AND deleted_at IS NULL ORDER BY sort_order',
      [row.id],
    );
    const exerciseIds = [...new Set(exerciseRows.map((r) => r.exercise_id))];
    const summaries = await this.loadExerciseSummaries(exerciseIds, executor);
    return {
      id: row.id,
      planId: row.plan_id,
      name: row.name,
      note: row.note,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      exercises: exerciseRows.map((r) => this.mapDayExerciseRow(r, summaries)),
    };
  }

  /**
   * Loads every day and every day-exercise for a whole plan, plus every
   * referenced exercise's summary, in three queries total regardless of how
   * many days/exercises the plan has - see this class's own doc comment for
   * why that matters.
   */
  private async loadDaysForPlan(planId: EntityId, executor: SqlExecutor): Promise<PlanDay[]> {
    const dayRows = await executor.select<PlanDayRow>(
      'SELECT * FROM plan_day WHERE plan_id = ? AND deleted_at IS NULL ORDER BY sort_order',
      [planId],
    );
    if (dayRows.length === 0) {
      return [];
    }
    const dayIds = dayRows.map((row) => row.id);
    const placeholders = dayIds.map(() => '?').join(', ');
    const exerciseRows = await executor.select<PlanDayExerciseRow>(
      `SELECT * FROM plan_day_exercise WHERE plan_day_id IN (${placeholders}) AND deleted_at IS NULL ORDER BY sort_order`,
      dayIds,
    );
    const exerciseIds = [...new Set(exerciseRows.map((row) => row.exercise_id))];
    const summaries = await this.loadExerciseSummaries(exerciseIds, executor);

    const byDay = new Map<string, PlanDayExercise[]>();
    for (const row of exerciseRows) {
      const list = byDay.get(row.plan_day_id) ?? [];
      list.push(this.mapDayExerciseRow(row, summaries));
      byDay.set(row.plan_day_id, list);
    }

    return dayRows.map((row) => ({
      id: row.id,
      planId: row.plan_id,
      name: row.name,
      note: row.note,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      exercises: byDay.get(row.id) ?? [],
    }));
  }

  private async loadExerciseSummaries(
    exerciseIds: readonly EntityId[],
    executor: SqlExecutor,
  ): Promise<Map<string, ExerciseListItem>> {
    const map = new Map<string, ExerciseListItem>();
    if (exerciseIds.length === 0) {
      return map;
    }
    const placeholders = exerciseIds.map(() => '?').join(', ');
    // Not filtered by `e.deleted_at IS NULL`: a plan_day_exercise row always
    // points at whichever exercise row exists (ON DELETE RESTRICT prevents a
    // hard delete while referenced; ExerciseService's own delete guard
    // prevents a soft delete via `listReferencingPlans` before this
    // repository is ever consulted) - showing it as-is, even in a stale-
    // reference edge case, beats silently dropping it from the day.
    const rows = await executor.select<ExerciseSummaryRow>(
      `SELECT e.id, e.source, e.catalog_slug, e.name_en, e.name_pl, e.level, e.equipment_slug, e.body_part,
              e.tracking_type, e.images,
              COALESCE(ud.is_favorite, 0) AS ud_is_favorite, ud.display_name_override AS ud_display_name_override
       FROM exercise e
       LEFT JOIN exercise_user_data ud ON ud.exercise_id = e.id
       WHERE e.id IN (${placeholders})`,
      [...exerciseIds],
    );
    for (const row of rows) {
      map.set(row.id, mapExerciseSummaryRow(row));
    }
    return map;
  }

  private mapDayExerciseRow(
    row: PlanDayExerciseRow,
    summaries: Map<string, ExerciseListItem>,
  ): PlanDayExercise {
    const exercise = summaries.get(row.exercise_id);
    if (!exercise) {
      throw new Error(
        `unreachable: plan_day_exercise "${row.id}" references missing exercise "${row.exercise_id}"`,
      );
    }
    return {
      id: row.id,
      planDayId: row.plan_day_id,
      exerciseId: row.exercise_id,
      sortOrder: row.sort_order,
      targetSets: row.target_sets,
      targetRepMin: row.target_rep_min,
      targetRepMax: row.target_rep_max,
      targetRpe: row.target_rpe,
      restSeconds: row.rest_seconds,
      supersetGroup: row.superset_group,
      note: row.note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      exercise,
    };
  }

  // --- table-parameterized mechanics for plan_day/plan_day_exercise ------------
  // Small equivalents of BaseSqliteRepository's own insertRow/updateRow/softDelete,
  // needed because those are hardwired to `this.table` ('plan'). `table` here is
  // always one of this file's own literals - see this class's doc comment.

  private async nextSortOrder(
    table: 'plan' | PlanChildTable,
    whereSql: string,
    params: readonly SqlParam[],
    executor: SqlExecutor,
  ): Promise<number> {
    const row = await executor.selectOne<{ next: number }>(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM ${table} WHERE ${whereSql} AND deleted_at IS NULL`,
      [...params],
    );
    return row?.next ?? 0;
  }

  private async insertInto(
    table: PlanChildTable,
    columns: Record<string, SqlParam>,
    tx: SqlExecutor,
  ): Promise<{ id: string }> {
    const id = this.generateId();
    const now = this.now();
    const entries: [string, SqlParam][] = [
      ['id', id],
      ...Object.entries(columns),
      ['created_at', now],
      ['updated_at', now],
    ];
    const columnNames = entries.map(([name]) => name);
    const params = entries.map(([, value]) => value);
    await tx.run(
      `INSERT INTO ${table} (${columnNames.join(', ')}) VALUES (${columnNames.map(() => '?').join(', ')})`,
      params,
    );
    return { id };
  }

  private async updateRowIn(
    table: PlanChildTable,
    id: EntityId,
    columns: Record<string, SqlParam>,
    executor: SqlExecutor,
  ): Promise<void> {
    const now = this.now();
    const entries: [string, SqlParam][] = [...Object.entries(columns), ['updated_at', now]];
    const assignments = entries.map(([name]) => `${name} = ?`).join(', ');
    const params: SqlParam[] = [...entries.map(([, value]) => value), id];
    const result = await executor.run(
      `UPDATE ${table} SET ${assignments} WHERE id = ? AND deleted_at IS NULL`,
      params,
    );
    if (result.changes === 0) {
      throw new RepositoryNotFoundError(table, id);
    }
  }

  /** Idempotent the same way `BaseSqliteRepository.softDelete` is: soft-deleting an already-deleted row is a silent no-op; a never-existing id still throws. */
  private async softDeleteRow(
    table: PlanChildTable,
    id: EntityId,
    executor: SqlExecutor,
  ): Promise<void> {
    const now = this.now();
    const result = await executor.run(
      `UPDATE ${table} SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
      [now, now, id],
    );
    if (result.changes === 0) {
      const exists = await executor.selectOne<{ id: string }>(`SELECT id FROM ${table} WHERE id = ?`, [
        id,
      ]);
      if (!exists) {
        throw new RepositoryNotFoundError(table, id);
      }
    }
  }

  /**
   * `plan_day`/`plan_day_exercise` equivalent of `BaseSqliteRepository.restore`,
   * which only ever covers `this.table` ('plan') - needed here for the same
   * reason `softDeleteRow`/`updateRowIn`/`insertInto` are: those two tables
   * aren't the base class's scoped table. Idempotent the same way `restore`
   * is: restoring a row that isn't deleted is a no-op, not an error; a
   * never-existing id still throws.
   */
  private async restoreRow(table: PlanChildTable, id: EntityId, executor: SqlExecutor): Promise<void> {
    const now = this.now();
    const result = await executor.run(
      `UPDATE ${table} SET deleted_at = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL`,
      [now, id],
    );
    if (result.changes === 0) {
      const exists = await executor.selectOne<{ id: string }>(`SELECT id FROM ${table} WHERE id = ?`, [
        id,
      ]);
      if (!exists) {
        throw new RepositoryNotFoundError(table, id);
      }
    }
  }
}
