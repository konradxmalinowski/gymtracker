/**
 * Reminder-occurrence calculator (ADR-0017 Decision 3): the shared
 * `NotificationScheduler` (`services/notifications/NotificationScheduler.ts`)
 * calls this on every re-arm (app foreground/boot) to compute exactly which
 * of today's occurrences remain to be scheduled - never an indefinite
 * repeating OS trigger. Kept pure and fully unit-/property-testable here so
 * the scheduling module itself only has to turn the result into
 * `expo-notifications` calls, never re-derive "what time(s) does this fire
 * today."
 *
 * **Timezone contract**: this module owns no timezone detection of its own.
 * `now` is a plain `Date`, and every occurrence this function returns is
 * built from `now`'s own local calendar day and local wall-clock getters
 * (`getFullYear`/`getMonth`/`getDate`/`getHours`/... - i.e. whatever timezone
 * the JS runtime that constructed `now` is configured for). In production
 * that is simply "pass `new Date()`" and the device's own timezone applies;
 * a caller that wants a different notion of "today" must adjust `now`
 * itself before calling this function - there is no separate timezone
 * parameter to get that wrong.
 */

export type ReminderType = 'scheduled' | 'interval';

export interface ReminderOccurrenceInput {
  reminderType: ReminderType;
  /** `HH:mm`, required (and only meaningful) when `reminderType === 'scheduled'`. */
  timeOfDay: string | null;
  /** Minutes, required (and only meaningful) when `reminderType === 'interval'`. Mirrors `daily_reminder.interval_minutes`'s own `CHECK (... >= 15)`, though this function does not itself enforce that floor - an out-of-range value here is a caller/validation bug, not something this pure calculator should paper over by clamping. */
  intervalMinutes: number | null;
}

function parseTimeOfDay(time: string): { hour: number; minute: number } | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) {
    return null;
  }
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function endOfLocalDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
}

/**
 * Every remaining occurrence of `reminder` for "today" (defined by `now` -
 * see this file's own timezone-contract doc comment above), as absolute
 * `Date`s strictly after `now` and no later than local end-of-day
 * (23:59:59.999).
 *
 * `scheduled`: `timeOfDay` parsed against today's date. Returns that single
 * instant if it is still strictly in the future; an already-passed time (or
 * an unparseable `timeOfDay`, or a `null` one) returns `[]` - there is no
 * "retry tomorrow" concept here, that is the caller's re-arm-on-next-
 * foreground/boot responsibility (ADR-0017 Decision 3), not this function's.
 *
 * `interval`: steps forward from `now` by `intervalMinutes` repeatedly,
 * collecting every step up to and including end-of-day. The first occurrence
 * returned is always `now + intervalMinutes`, never `now` itself - a
 * reminder re-armed one tick after its own last occurrence fired must not
 * immediately refire. A missing/non-positive `intervalMinutes` returns `[]`.
 */
export function computeRemainingOccurrencesToday(
  reminder: ReminderOccurrenceInput,
  now: Date,
): Date[] {
  if (reminder.reminderType === 'scheduled') {
    if (reminder.timeOfDay === null) {
      return [];
    }
    const parsed = parseTimeOfDay(reminder.timeOfDay);
    if (!parsed) {
      return [];
    }
    const occurrence = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      parsed.hour,
      parsed.minute,
      0,
      0,
    );
    return occurrence.getTime() > now.getTime() ? [occurrence] : [];
  }

  const { intervalMinutes } = reminder;
  if (intervalMinutes === null || !Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
    return [];
  }

  const endOfDay = endOfLocalDay(now);
  const stepMs = intervalMinutes * 60_000;
  const occurrences: Date[] = [];
  let cursor = new Date(now.getTime() + stepMs);
  while (cursor.getTime() <= endOfDay.getTime()) {
    occurrences.push(cursor);
    cursor = new Date(cursor.getTime() + stepMs);
  }
  return occurrences;
}
