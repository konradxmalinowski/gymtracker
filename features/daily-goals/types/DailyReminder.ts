import type { EntityId } from '@/repositories/contracts/repository';
import type { ReminderType } from '../domain/reminderOccurrences';

export type { ReminderType };

/**
 * One `daily_reminder` row, camelCase. `goalId` is nullable - `null` means
 * standalone (`ON DELETE SET NULL` on the goal FK - deleting a goal degrades
 * its reminder to standalone rather than destroying it, per
 * ARCHITECTURE.md section 7.12). Exactly one of `timeOfDay`/`intervalMinutes`
 * is non-null, matching `reminderType` (`daily_reminder`'s own CHECK
 * constraint XOR-ing the two).
 */
export interface DailyReminder {
  id: EntityId;
  goalId: EntityId | null;
  name: string;
  icon: string | null;
  isEnabled: boolean;
  reminderType: ReminderType;
  timeOfDay: string | null;
  intervalMinutes: number | null;
  activeWeekdays: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

/** `'done' | 'not_done'` - mirrors `daily_reminder_response.response`'s own CHECK constraint. "Ignored" is never a stored value; see `DailyReminderService.getReminderStats`. */
export type ReminderResponseValue = 'done' | 'not_done';

/**
 * One `daily_reminder_response` row, camelCase - the response **log**, one
 * row per `(reminderId, localDate)`, last-tap-wins. No `deletedAt` - like
 * `daily_goal_entry`, this table has no soft delete of its own; a response
 * is only ever removed by its parent reminder's `ON DELETE CASCADE`.
 */
export interface DailyReminderResponse {
  id: EntityId;
  reminderId: EntityId;
  localDate: string;
  response: ReminderResponseValue;
  respondedAt: number;
  createdAt: number;
}

/** `DailyReminderService.getReminderStats`'s own return shape - "ignored" is computed there (active days in range minus rows present), never stored. */
export interface ReminderStats {
  done: number;
  notDone: number;
  ignored: number;
}
