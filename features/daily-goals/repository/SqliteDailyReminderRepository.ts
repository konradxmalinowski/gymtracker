import type { SqlExecutor, SqlParam } from '@/repositories/contracts/database';
import type { EntityId } from '@/repositories/contracts/repository';
import { BaseSqliteRepository, type AuditedRow } from '@/repositories/base';
import type { MondayBasedWeekdayIndex } from '../domain/weekdayBitmask';
import type {
  DailyReminder,
  DailyReminderResponse,
  ReminderResponseValue,
  ReminderType,
} from '../types/DailyReminder';
import type {
  CreateDailyReminderInput,
  DailyReminderRepository,
  UpdateDailyReminderPatch,
} from './DailyReminderRepository';

interface DailyReminderRow extends AuditedRow {
  goal_id: string | null;
  name: string;
  icon: string | null;
  is_enabled: number;
  reminder_type: ReminderType;
  time_of_day: string | null;
  interval_minutes: number | null;
  active_weekdays: number;
}

interface DailyReminderResponseRow {
  id: string;
  reminder_id: string;
  local_date: string;
  response: ReminderResponseValue;
  responded_at: number;
  created_at: number;
}

function mapReminderRow(row: DailyReminderRow): DailyReminder {
  return {
    id: row.id,
    goalId: row.goal_id,
    name: row.name,
    icon: row.icon,
    isEnabled: row.is_enabled === 1,
    reminderType: row.reminder_type,
    timeOfDay: row.time_of_day,
    intervalMinutes: row.interval_minutes,
    activeWeekdays: row.active_weekdays,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function mapResponseRow(row: DailyReminderResponseRow): DailyReminderResponse {
  return {
    id: row.id,
    reminderId: row.reminder_id,
    localDate: row.local_date,
    response: row.response,
    respondedAt: row.responded_at,
    createdAt: row.created_at,
  };
}

/**
 * SQLite implementation of `DailyReminderRepository` (`database/schema.sql`
 * section 7.12, P17). Extends `BaseSqliteRepository<DailyReminder,
 * DailyReminderRow>` scoped to `daily_reminder` - `findById`/`softDelete`/
 * `restore`/`purge` come from the base class. `daily_reminder_response` has
 * no `deleted_at` column (its response log is only ever removed by its
 * parent reminder's own `ON DELETE CASCADE`), so its methods are hand-written
 * queries, the same shape `SqliteDailyGoalRepository` uses for
 * `daily_goal_entry`.
 */
export class SqliteDailyReminderRepository
  extends BaseSqliteRepository<DailyReminder, DailyReminderRow>
  implements DailyReminderRepository
{
  protected readonly table = 'daily_reminder';

  protected mapRow(row: DailyReminderRow): DailyReminder {
    return mapReminderRow(row);
  }

  async create(input: CreateDailyReminderInput, tx?: SqlExecutor): Promise<DailyReminder> {
    const { id } = await this.insertRow(
      {
        goal_id: input.goalId ?? null,
        name: input.name,
        icon: input.icon ?? null,
        is_enabled: 1,
        reminder_type: input.reminderType,
        time_of_day: input.timeOfDay ?? null,
        interval_minutes: input.intervalMinutes ?? null,
        active_weekdays: input.activeWeekdays,
      },
      tx,
    );
    const created = await this.findById(id, tx);
    if (!created) {
      throw new Error('unreachable: daily_reminder row was just inserted');
    }
    return created;
  }

  async update(
    id: EntityId,
    patch: UpdateDailyReminderPatch,
    tx?: SqlExecutor,
  ): Promise<DailyReminder> {
    const columns: Record<string, SqlParam> = {};
    if (patch.goalId !== undefined) columns.goal_id = patch.goalId;
    if (patch.name !== undefined) columns.name = patch.name;
    if (patch.icon !== undefined) columns.icon = patch.icon;
    if (patch.reminderType !== undefined) columns.reminder_type = patch.reminderType;
    if (patch.timeOfDay !== undefined) columns.time_of_day = patch.timeOfDay;
    if (patch.intervalMinutes !== undefined) columns.interval_minutes = patch.intervalMinutes;
    if (patch.activeWeekdays !== undefined) columns.active_weekdays = patch.activeWeekdays;

    await this.updateRow(id, columns, tx);

    const updated = await this.findById(id, tx);
    if (!updated) {
      throw new Error('unreachable: daily_reminder row was just updated');
    }
    return updated;
  }

  async setEnabled(id: EntityId, isEnabled: boolean, tx?: SqlExecutor): Promise<void> {
    await this.updateRow(id, { is_enabled: isEnabled ? 1 : 0 }, tx);
  }

  async listAll(tx?: SqlExecutor): Promise<DailyReminder[]> {
    const rows = await this.executor(tx).select<DailyReminderRow>(
      'SELECT * FROM daily_reminder WHERE deleted_at IS NULL ORDER BY created_at ASC',
    );
    return rows.map(mapReminderRow);
  }

  async listByGoalId(goalId: EntityId, tx?: SqlExecutor): Promise<DailyReminder[]> {
    const rows = await this.executor(tx).select<DailyReminderRow>(
      'SELECT * FROM daily_reminder WHERE goal_id = ? AND deleted_at IS NULL ORDER BY created_at ASC',
      [goalId],
    );
    return rows.map(mapReminderRow);
  }

  async listActiveForWeekday(
    localDate: string,
    weekdayIndex: MondayBasedWeekdayIndex,
    tx?: SqlExecutor,
  ): Promise<DailyReminder[]> {
    const rows = await this.executor(tx).select<DailyReminderRow>(
      `SELECT * FROM daily_reminder
       WHERE is_enabled = 1 AND deleted_at IS NULL AND (active_weekdays >> ?) & 1 = 1`,
      [weekdayIndex],
    );
    return rows.map(mapReminderRow);
  }

  async recordResponse(
    reminderId: EntityId,
    localDate: string,
    response: ReminderResponseValue,
    tx?: SqlExecutor,
  ): Promise<DailyReminderResponse> {
    const executor = this.executor(tx);
    const now = this.now();
    const id = this.generateId();
    // Same composite-unique-index upsert shape as
    // `SqliteDailyGoalRepository.upsertEntryForToday()` - `ON CONFLICT(reminder_id,
    // local_date)` targets `ux_daily_reminder_response_reminder_date`,
    // "last tap wins" (ARCHITECTURE.md section 7.12): no history, just the
    // latest `response`/`responded_at` for that reminder/day.
    await executor.run(
      `INSERT INTO daily_reminder_response (id, reminder_id, local_date, response, responded_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(reminder_id, local_date) DO UPDATE SET
         response = excluded.response,
         responded_at = excluded.responded_at`,
      [id, reminderId, localDate, response, now, now],
    );
    const row = await executor.selectOne<DailyReminderResponseRow>(
      'SELECT * FROM daily_reminder_response WHERE reminder_id = ? AND local_date = ?',
      [reminderId, localDate],
    );
    if (!row) {
      throw new Error('unreachable: daily_reminder_response row was just upserted');
    }
    return mapResponseRow(row);
  }

  async listResponses(
    reminderId: EntityId,
    dateRangeFrom: string,
    dateRangeTo: string,
    tx?: SqlExecutor,
  ): Promise<DailyReminderResponse[]> {
    const rows = await this.executor(tx).select<DailyReminderResponseRow>(
      `SELECT * FROM daily_reminder_response
       WHERE reminder_id = ? AND local_date BETWEEN ? AND ?
       ORDER BY local_date ASC`,
      [reminderId, dateRangeFrom, dateRangeTo],
    );
    return rows.map(mapResponseRow);
  }
}
