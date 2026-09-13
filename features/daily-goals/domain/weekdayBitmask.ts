/**
 * Weekday-bitmask helpers for `daily_goal.active_weekdays`/
 * `daily_reminder.active_weekdays` (`database/schema.sql` section 7.12,
 * ARCHITECTURE.md section 7.12, ADR-0017 Decision 1): a single `INTEGER`
 * column, bit0 = Monday through bit6 = Sunday, `CHECK`-constrained to the
 * range 1-127 so at least one day is always set at the database level.
 *
 * **This is a DIFFERENT convention from this codebase's other weekday
 * numbering.** `services/notifications/WorkoutReminderService.ts`'s
 * `reminders.days`/`toExpoWeekday()` uses a Sunday-based index (0 = Sunday,
 * matching JS `Date.prototype.getDay()` and `expo-notifications`' own
 * `WeeklyTriggerInput.weekday`). This file's bit0-Monday convention is
 * ADR-0017's own, unrelated to that one - do not read a `0` from one
 * convention as meaning the same day as a `0` from the other.
 */

import { parseLocalDate } from './localDate';

/** Monday=0 .. Sunday=6 - this file's own convention, matching `active_weekdays`'s bit0=Monday layout. */
export type MondayBasedWeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** `true` when bit `weekdayIndex` (0=Monday..6=Sunday) is set in `activeWeekdays`. */
export function isWeekdayActive(
  activeWeekdays: number,
  weekdayIndex: MondayBasedWeekdayIndex,
): boolean {
  return ((activeWeekdays >> weekdayIndex) & 1) === 1;
}

/**
 * Converts a `local_date` (`YYYY-MM-DD`) string into this file's Monday-based
 * weekday index. Reuses the exact `(jsDay + 6) % 7` transform
 * `features/home/hooks/useHomeDashboard.ts`'s own `mondayIndexOf()` helper
 * already established for turning JS's Sunday-based `getUTCDay()` into a
 * Monday-based index - `daily-goals` cannot import that hook (a total leaf
 * per ARCHITECTURE.md section 9.1), so this is a deliberate, small
 * duplication of the transform itself, not a reinvention of it.
 */
export function weekdayIndexOf(localDate: string): MondayBasedWeekdayIndex {
  const jsDay = new Date(parseLocalDate(localDate)).getUTCDay(); // 0=Sunday..6=Saturday
  return ((jsDay + 6) % 7) as MondayBasedWeekdayIndex;
}
