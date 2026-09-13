import type { SqlExecutor, SqlParam } from '@/repositories/contracts/database';
import type { EntityId } from '@/repositories/contracts/repository';
import {
  BaseSqliteRepository,
  RepositoryNotFoundError,
  type AuditedRow,
} from '@/repositories/base';
import type { MondayBasedWeekdayIndex } from '../domain/weekdayBitmask';
import type {
  DailyGoal,
  DailyGoalEntry,
  DailyGoalWithTodayEntry,
  GoalType,
} from '../types/DailyGoal';
import type {
  CreateDailyGoalInput,
  DailyGoalRepository,
  UpdateDailyGoalPatch,
} from './DailyGoalRepository';

interface DailyGoalRow extends AuditedRow {
  name: string;
  icon: string | null;
  goal_type: GoalType;
  target_value: number | null;
  unit: string | null;
  active_weekdays: number;
  is_enabled: number;
  sort_order: number;
}

interface DailyGoalEntryRow {
  id: string;
  goal_id: string;
  local_date: string;
  progress_value: number;
  created_at: number;
  updated_at: number;
}

/** Row shape of `listActiveGoalsForWeekday`'s own `LEFT JOIN` - `entry_*` columns are all `NULL` when the goal has no entry for `localDate` yet. */
interface GoalWithEntryRow extends DailyGoalRow {
  entry_id: string | null;
  entry_local_date: string | null;
  entry_progress_value: number | null;
  entry_created_at: number | null;
  entry_updated_at: number | null;
}

function mapGoalRow(row: DailyGoalRow): DailyGoal {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    goalType: row.goal_type,
    targetValue: row.target_value,
    unit: row.unit,
    activeWeekdays: row.active_weekdays,
    isEnabled: row.is_enabled === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function mapEntryRow(row: DailyGoalEntryRow): DailyGoalEntry {
  return {
    id: row.id,
    goalId: row.goal_id,
    localDate: row.local_date,
    progressValue: row.progress_value,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * SQLite implementation of `DailyGoalRepository` (`database/schema.sql`
 * section 7.12, P17). Extends `BaseSqliteRepository<DailyGoal, DailyGoalRow>`
 * scoped to `daily_goal` - `findById`/`softDelete`/`restore`/`purge` come
 * from the base class for `daily_goal` itself, mirroring
 * `SqliteBodyMetricRepository`'s own precedent.
 *
 * `daily_goal_entry` has no `deleted_at` column at all (unlike every
 * `AuditedRow`-shaped table this base class targets - an entry's history is
 * only ever removed by its parent goal's own `ON DELETE CASCADE`, per
 * ARCHITECTURE.md section 7.12), so every entry-table method below is a
 * small, hand-written query rather than a base-class call - the same "own
 * small table-parameterized equivalent" pattern `SqlitePlanRepository`
 * already uses for its own non-primary child tables (`plan_day`/
 * `plan_day_exercise`), just simpler since there is only one child table
 * here, not two.
 */
export class SqliteDailyGoalRepository
  extends BaseSqliteRepository<DailyGoal, DailyGoalRow>
  implements DailyGoalRepository
{
  protected readonly table = 'daily_goal';

  protected mapRow(row: DailyGoalRow): DailyGoal {
    return mapGoalRow(row);
  }

  private async nextSortOrder(executor: SqlExecutor): Promise<number> {
    const row = await executor.selectOne<{ next: number }>(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM daily_goal WHERE deleted_at IS NULL',
    );
    return row?.next ?? 0;
  }

  async create(input: CreateDailyGoalInput, tx?: SqlExecutor): Promise<DailyGoal> {
    const runner = async (t: SqlExecutor): Promise<DailyGoal> => {
      const sortOrder = await this.nextSortOrder(t);
      const { id } = await this.insertRow(
        {
          name: input.name,
          icon: input.icon ?? null,
          goal_type: input.goalType,
          target_value: input.targetValue ?? null,
          unit: input.unit ?? null,
          active_weekdays: input.activeWeekdays,
          is_enabled: 1,
          sort_order: sortOrder,
        },
        t,
      );
      const created = await this.findById(id, t);
      if (!created) {
        throw new Error('unreachable: daily_goal row was just inserted');
      }
      return created;
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  async update(id: EntityId, patch: UpdateDailyGoalPatch, tx?: SqlExecutor): Promise<DailyGoal> {
    const columns: Record<string, SqlParam> = {};
    if (patch.name !== undefined) columns.name = patch.name;
    if (patch.icon !== undefined) columns.icon = patch.icon;
    if (patch.goalType !== undefined) columns.goal_type = patch.goalType;
    if (patch.targetValue !== undefined) columns.target_value = patch.targetValue;
    if (patch.unit !== undefined) columns.unit = patch.unit;
    if (patch.activeWeekdays !== undefined) columns.active_weekdays = patch.activeWeekdays;

    // Always calls updateRow, even with an empty `columns`, so an empty patch
    // against a missing/deleted id still throws RepositoryNotFoundError -
    // same reasoning `SqliteBodyMetricRepository.update()`'s own comment gives.
    await this.updateRow(id, columns, tx);

    const updated = await this.findById(id, tx);
    if (!updated) {
      throw new Error('unreachable: daily_goal row was just updated');
    }
    return updated;
  }

  async listAll(tx?: SqlExecutor): Promise<DailyGoal[]> {
    const rows = await this.executor(tx).select<DailyGoalRow>(
      'SELECT * FROM daily_goal WHERE deleted_at IS NULL ORDER BY sort_order ASC',
    );
    return rows.map(mapGoalRow);
  }

  async setEnabled(id: EntityId, isEnabled: boolean, tx?: SqlExecutor): Promise<void> {
    await this.updateRow(id, { is_enabled: isEnabled ? 1 : 0 }, tx);
  }

  /** Mirrors `SqlitePlanRepository.reorderPlans`'s exact shape: one `UPDATE` per id, all joined in a transaction when the caller doesn't already supply one. */
  async reorder(orderedIds: readonly EntityId[], tx?: SqlExecutor): Promise<void> {
    const runner = async (t: SqlExecutor): Promise<void> => {
      const now = this.now();
      for (let index = 0; index < orderedIds.length; index += 1) {
        const result = await t.run(
          'UPDATE daily_goal SET sort_order = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
          [index, now, orderedIds[index]!],
        );
        if (result.changes === 0) {
          throw new RepositoryNotFoundError('daily_goal', orderedIds[index]!);
        }
      }
    };
    return tx ? runner(tx) : this.deps.db.transaction(runner);
  }

  async listActiveGoalsForWeekday(
    localDate: string,
    weekdayIndex: MondayBasedWeekdayIndex,
    tx?: SqlExecutor,
  ): Promise<DailyGoalWithTodayEntry[]> {
    const rows = await this.executor(tx).select<GoalWithEntryRow>(
      `SELECT g.*, e.id AS entry_id, e.local_date AS entry_local_date,
              e.progress_value AS entry_progress_value, e.created_at AS entry_created_at,
              e.updated_at AS entry_updated_at
       FROM daily_goal g
       LEFT JOIN daily_goal_entry e ON e.goal_id = g.id AND e.local_date = ?
       WHERE g.is_enabled = 1 AND g.deleted_at IS NULL AND (g.active_weekdays >> ?) & 1 = 1
       ORDER BY g.sort_order ASC`,
      [localDate, weekdayIndex],
    );
    return rows.map((row) => ({
      goal: mapGoalRow(row),
      entry:
        row.entry_id !== null
          ? mapEntryRow({
              id: row.entry_id,
              goal_id: row.id,
              local_date: row.entry_local_date!,
              progress_value: row.entry_progress_value!,
              created_at: row.entry_created_at!,
              updated_at: row.entry_updated_at!,
            })
          : null,
    }));
  }

  async upsertEntryForToday(
    goalId: EntityId,
    localDate: string,
    progressValue: number,
    tx?: SqlExecutor,
  ): Promise<DailyGoalEntry> {
    const executor = this.executor(tx);
    const now = this.now();
    const id = this.generateId();
    // `ON CONFLICT(goal_id, local_date)` targets `ux_daily_goal_entry_goal_date`,
    // a composite unique-index conflict target - NOT a single primary-key
    // column, so this cannot reuse `SqliteDataTransferRepository.upsertRow()`'s
    // shape (that helper's `ON CONFLICT(${primaryKeyColumn})` only ever names
    // one column). Own small helper inline instead, per this phase's own brief.
    await executor.run(
      `INSERT INTO daily_goal_entry (id, goal_id, local_date, progress_value, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(goal_id, local_date) DO UPDATE SET
         progress_value = excluded.progress_value,
         updated_at = excluded.updated_at`,
      [id, goalId, localDate, progressValue, now, now],
    );
    const entry = await this.getEntry(goalId, localDate, executor);
    if (!entry) {
      throw new Error('unreachable: daily_goal_entry row was just upserted');
    }
    return entry;
  }

  async getEntry(
    goalId: EntityId,
    localDate: string,
    tx?: SqlExecutor,
  ): Promise<DailyGoalEntry | null> {
    const row = await this.executor(tx).selectOne<DailyGoalEntryRow>(
      'SELECT * FROM daily_goal_entry WHERE goal_id = ? AND local_date = ?',
      [goalId, localDate],
    );
    return row ? mapEntryRow(row) : null;
  }

  async listEntryHistory(
    goalId: EntityId,
    dateRangeFrom: string,
    dateRangeTo: string,
    tx?: SqlExecutor,
  ): Promise<DailyGoalEntry[]> {
    const rows = await this.executor(tx).select<DailyGoalEntryRow>(
      `SELECT * FROM daily_goal_entry
       WHERE goal_id = ? AND local_date BETWEEN ? AND ?
       ORDER BY local_date ASC`,
      [goalId, dateRangeFrom, dateRangeTo],
    );
    return rows.map(mapEntryRow);
  }
}
