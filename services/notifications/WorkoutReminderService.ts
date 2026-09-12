/**
 * Gravitus-inspired refresh: local, offline-only weekly workout reminders -
 * `expo-notifications`, the exact package `features/rest-timer/services/
 * RestTimerNotificationService.ts` already uses, following the same
 * established pattern: permission is requested lazily on the first real
 * schedule attempt (never proactively, e.g. at onboarding), the module owns
 * its own Android notification channel, and every method degrades to a
 * silent no-op rather than throwing (denied permission, no native binding, a
 * rejected native call) - a failed schedule must never surface as an error
 * to whatever settings screen called it.
 *
 * `services/notifications/` is the root-level, reserved-but-unbuilt services
 * folder CLAUDE.md's "Folder structure" section has listed since P0 - this
 * is its first real occupant, the same "first real occupant of a previously
 * empty folder" precedent P7's write-up already used for `hooks/useAppState.ts`.
 * Distinct from `features/rest-timer/services/`, which owns the rest timer's
 * own, differently-shaped (single absolute-deadline) notification.
 *
 * Recurrence uses `expo-notifications`' own `WEEKLY` calendar trigger (one
 * scheduled notification per selected weekday) rather than a relative delay
 * or a hand-rolled "reschedule after it fires" loop - the trigger type this
 * package's own types document for "delivered once every week when the
 * weekday/hour/minute match," available on both platforms.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const ANDROID_CHANNEL_ID = 'workout-reminders';
const ANDROID_CHANNEL_NAME = 'Workout Reminders';

/**
 * Every reminder notification this service schedules carries an identifier
 * under this prefix (`${PREFIX}${weekday}`) so `reschedule()` can find and
 * cancel exactly its own notifications via `getAllScheduledNotificationsAsync()`
 * - never `cancelAllScheduledNotificationsAsync()`, which would also cancel
 * an unrelated, currently-running rest-timer notification scheduled by
 * `RestTimerNotificationService`.
 */
const NOTIFICATION_ID_PREFIX = 'workout-reminder-day-';

let androidChannelEnsured = false;

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android' || androidChannelEnsured) {
    return;
  }
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: ANDROID_CHANNEL_NAME,
    importance: Notifications.AndroidImportance.DEFAULT,
    enableVibrate: true,
  });
  androidChannelEnsured = true;
}

/** Byte-identical in behavior to `RestTimerNotificationService`'s own copy - re-prompting a user who already declined is nagging, not "lazy," and both platforms silently suppress the native dialog in that case regardless. Kept as its own small copy rather than a shared helper: `rest-timer` must stay a leaf feature with no dependency on this root-level module, and this module has no feature of its own to share code with either. */
async function requestPermissionIfNeeded(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) {
      return true;
    }
    if (!current.canAskAgain) {
      return false;
    }
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch {
    return false;
  }
}

function parseTimeOfDay(time: string): { hour: number; minute: number } | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) {
    return null;
  }
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

/** This app's weekday convention (`reminders.days`, 0 = Sunday, matching JS `Date.getDay()`) to `expo-notifications`' own `WeeklyTriggerInput.weekday` convention (1 = Sunday through 7 = Saturday, per that type's own doc comment). */
function toExpoWeekday(day: number): number {
  return day + 1;
}

/** Cancels every previously scheduled workout-reminder notification (identified by `NOTIFICATION_ID_PREFIX`), leaving any other scheduled notification - the rest timer's, most notably - untouched. Best-effort: a failure reading or cancelling is swallowed, matching this service's "never throw" contract. */
async function cancelAll(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const notification of scheduled) {
      if (notification.identifier.startsWith(NOTIFICATION_ID_PREFIX)) {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
      }
    }
  } catch {
    // Best-effort cleanup - see this module's own "never throw" contract.
  }
}

/**
 * Cancels every existing reminder notification, then - if `days` is
 * non-empty - schedules one fresh `WEEKLY` trigger per selected weekday at
 * `time`. Cancel-then-reschedule rather than a diff: simpler, and this is a
 * settings-screen "Save" action, not a hot path with a latency budget to
 * protect. Never throws: an invalid `time` string, a denied permission, or
 * any native-call failure degrades to "the old schedule is cancelled and
 * nothing new is scheduled" rather than a thrown error - the caller sees no
 * exception either way.
 */
async function reschedule(days: readonly number[], time: string): Promise<void> {
  await cancelAll();

  if (days.length === 0) {
    return;
  }

  const timeOfDay = parseTimeOfDay(time);
  if (!timeOfDay) {
    return;
  }

  const granted = await requestPermissionIfNeeded();
  if (!granted) {
    return;
  }

  try {
    await ensureAndroidChannel();
    for (const day of days) {
      await Notifications.scheduleNotificationAsync({
        identifier: `${NOTIFICATION_ID_PREFIX}${day}`,
        content: {
          title: 'Time to train',
          body: "Log today's workout to keep your streak going.",
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: toExpoWeekday(day),
          hour: timeOfDay.hour,
          minute: timeOfDay.minute,
          channelId: ANDROID_CHANNEL_ID,
        },
      });
    }
  } catch {
    // Degrades to "nothing scheduled" - see this function's own doc comment.
  }
}

export const workoutReminderService = {
  reschedule,
  cancelAll,
  requestPermissionIfNeeded,
};

export type WorkoutReminderService = typeof workoutReminderService;

/** Test-only escape hatch, mirroring `RestTimerNotificationService`'s own - so the Android-channel memoization doesn't leak between test cases. Not part of the public API. */
export function __resetAndroidChannelStateForTesting(): void {
  androidChannelEnsured = false;
}
