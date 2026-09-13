import type { SqlExecutor } from '@/repositories/contracts/database';
import type { EntityId } from '@/repositories/contracts/repository';
import type { MondayBasedWeekdayIndex } from '../domain/weekdayBitmask';
import type {
  DailyReminder,
  DailyReminderResponse,
  ReminderResponseValue,
  ReminderType,
} from '../types/DailyReminder';

export interface CreateDailyReminderInput {
  /** `null` for a standalone reminder - `daily_reminder.goal_id` is nullable, `ON DELETE SET NULL`. */
  goalId?: EntityId | null;
  name: string;
  icon?: string | null;
  reminderType: ReminderType;
  /** Required (and only meaningful) when `reminderType === 'scheduled'`. */
  timeOfDay?: string | null;
  /** Required (and only meaningful) when `reminderType === 'interval'`. */
  intervalMinutes?: number | null;
  activeWeekdays: number;
}

export interface UpdateDailyReminderPatch {
  goalId?: EntityId | null;
  name?: string;
  icon?: string | null;
  reminderType?: ReminderType;
  timeOfDay?: string | null;
  intervalMinutes?: number | null;
  activeWeekdays?: number;
}

/**
 * Daily-reminder repository (`daily_reminder`/`daily_reminder_response`,
 * `database/schema.sql` section 7.12, P17). `findById`/`softDelete`/
 * `restore`/`purge` come from `BaseSqliteRepository`, scoped to
 * `daily_reminder` - not re-declared here.
 */
export interface DailyReminderRepository {
  findById(id: EntityId, tx?: SqlExecutor): Promise<DailyReminder | null>;
  softDelete(id: EntityId, tx?: SqlExecutor): Promise<void>;
  restore(id: EntityId, tx?: SqlExecutor): Promise<void>;
  purge(id: EntityId, tx?: SqlExecutor): Promise<void>;

  create(input: CreateDailyReminderInput, tx?: SqlExecutor): Promise<DailyReminder>;
  update(id: EntityId, patch: UpdateDailyReminderPatch, tx?: SqlExecutor): Promise<DailyReminder>;

  setEnabled(id: EntityId, isEnabled: boolean, tx?: SqlExecutor): Promise<void>;

  /** Every non-deleted reminder, standalone and goal-linked alike - the management screen's full list. */
  listAll(tx?: SqlExecutor): Promise<DailyReminder[]>;

  /** Every non-deleted reminder linked to `goalId` - a goal's own reminder(s), for the goal detail/edit screen. */
  listByGoalId(goalId: EntityId, tx?: SqlExecutor): Promise<DailyReminder[]>;

  /** Every enabled, non-deleted reminder whose `active_weekdays` bit for `weekdayIndex` is set - `NotificationScheduler`'s own re-arm read. */
  listActiveForWeekday(
    localDate: string,
    weekdayIndex: MondayBasedWeekdayIndex,
    tx?: SqlExecutor,
  ): Promise<DailyReminder[]>;

  /**
   * Upserts the `(reminderId, localDate)` response - "last tap wins"
   * (ARCHITECTURE.md section 7.12): a fresh row on the first tap that day, an
   * in-place `response`/`responded_at` overwrite on any later tap the same
   * day, never a flip-flop history.
   */
  recordResponse(
    reminderId: EntityId,
    localDate: string,
    response: ReminderResponseValue,
    tx?: SqlExecutor,
  ): Promise<DailyReminderResponse>;

  /** Flat, unbounded read - `local_date ASC` - for `DailyReminderService.getReminderStats`'s own done/not-done/ignored tally. */
  listResponses(
    reminderId: EntityId,
    dateRangeFrom: string,
    dateRangeTo: string,
    tx?: SqlExecutor,
  ): Promise<DailyReminderResponse[]>;
}
