/**
 * `NotificationScheduler` - the shared notification module ARCHITECTURE.md
 * section 9's folder structure and section 8.4's `AppContainer` interface
 * have described since P0 but nothing implemented until now (ADR-0016). P17
 * (daily goals and reminders) is its first real consumer, per ADR-0016's
 * chosen option C: `services/notifications/WorkoutReminderService.ts` and
 * `features/rest-timer/services/RestTimerNotificationService.ts` are NOT
 * touched or migrated by this module - they keep scheduling/cancelling their
 * own notifications exactly as before. This is a real, documented gap (three
 * independent local-notification code paths, not the two ADR-0016
 * anticipated when it was written) - tracked at the ADR/roadmap level, not
 * silently resolved by reaching into either of those two files here.
 *
 * Follows the exact conventions both existing wrappers already established:
 * permission is requested lazily on the first real schedule attempt (never
 * proactively), this module owns its own Android notification channel, and
 * every method degrades to a silent no-op rather than throwing (denied
 * permission, no native binding, a rejected native call) - a failed schedule
 * must never surface as an error to whatever caller triggered it.
 *
 * ADR-0017 Decision 3: only today's remaining occurrences are ever scheduled
 * at once, per reminder - never an indefinite repeating trigger. The caller
 * (a future frontend-agent pass wiring `useAppState`/boot handlers) is
 * responsible for calling `scheduleRemainingOccurrencesToday` again on every
 * app foreground and app boot; this module has no timer/listener of its own.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
  computeRemainingOccurrencesToday,
  type DailyGoalService,
  type DailyReminder,
  type DailyReminderService,
} from '@/features/daily-goals';
import type { Clock } from '@/services/clock';

const ANDROID_CHANNEL_ID = 'daily-goals-reminders';
const ANDROID_CHANNEL_NAME = 'Daily Goal Reminders';

/** `NotificationContentInput.categoryIdentifier` this module registers once via `setNotificationCategoryAsync`, applied to every reminder notification it schedules. */
const REMINDER_CATEGORY_ID = 'daily-reminder-actions';
const ACTION_DONE = 'daily-reminder-done';
const ACTION_NOT_DONE = 'daily-reminder-not-done';

/**
 * Every notification this module schedules for reminder `reminderId` carries
 * an identifier under `${PREFIX}${reminderId}-`, so `cancelForReminder` can
 * find and cancel exactly that one reminder's own pending occurrences via
 * `getAllScheduledNotificationsAsync()` - never
 * `cancelAllScheduledNotificationsAsync()`, which would also cancel an
 * unrelated rest-timer countdown or workout-reminder notification, and never
 * a feature-wide prefix either, since two different reminders re-arming
 * independently must not cancel each other's pending occurrences (unlike
 * `WorkoutReminderService.cancelAll()`, which is correct to be feature-wide
 * because that feature has exactly one configurable schedule, not many
 * independent per-reminder ones).
 */
const NOTIFICATION_ID_PREFIX = 'daily-reminder-';

function idPrefixFor(reminderId: string): string {
  return `${NOTIFICATION_ID_PREFIX}${reminderId}-`;
}

let androidChannelEnsured = false;
let categoryEnsured = false;

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

/**
 * Registers the "Zrealizowane"/"Nie" action-button category once. Idempotent
 * and memoized the same way `ensureAndroidChannel` is - `setNotificationCategoryAsync`
 * is itself idempotent (re-registering the same identifier just overwrites
 * it), but there is no reason to pay the native round-trip on every schedule
 * call.
 */
async function ensureReminderCategory(): Promise<void> {
  if (categoryEnsured) {
    return;
  }
  await Notifications.setNotificationCategoryAsync(REMINDER_CATEGORY_ID, [
    { identifier: ACTION_DONE, buttonTitle: 'Zrealizowane' },
    { identifier: ACTION_NOT_DONE, buttonTitle: 'Nie' },
  ]);
  categoryEnsured = true;
}

/**
 * Byte-identical in behavior to `WorkoutReminderService`'s/
 * `RestTimerNotificationService`'s own copies - kept as its own small copy
 * rather than a shared helper per this phase's own brief (extracting one now
 * would be scope creep beyond what P17 owns, and neither of those two
 * modules is being touched by this pass).
 */
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

/** Data payload every reminder notification this module schedules carries, so `handleNotificationResponse` can route a tapped action back to the right goal/reminder with no extra lookup beyond `dailyGoalService.getGoal`. */
interface DailyReminderNotificationData {
  kind: 'daily-reminder';
  reminderId: string;
  goalId: string | null;
  /** Index signature so this satisfies `NotificationContentInput.data?: Record<string, unknown>` when passed straight through. */
  [key: string]: unknown;
}

function isDailyReminderNotificationData(data: unknown): data is DailyReminderNotificationData {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { kind?: unknown }).kind === 'daily-reminder' &&
    typeof (data as { reminderId?: unknown }).reminderId === 'string'
  );
}

/**
 * Cancels every previously scheduled notification belonging to `reminderId`
 * (identified by its own `idPrefixFor(reminderId)` prefix), leaving every
 * other scheduled notification - another reminder's, the rest timer's, the
 * workout reminder's - untouched. Best-effort: a failure reading or
 * cancelling is swallowed, matching this module's "never throw" contract.
 */
async function cancelForReminder(reminderId: string): Promise<void> {
  try {
    const prefix = idPrefixFor(reminderId);
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const notification of scheduled) {
      if (notification.identifier.startsWith(prefix)) {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
      }
    }
  } catch {
    // Best-effort cleanup - see this module's own "never throw" contract.
  }
}

/**
 * ADR-0017 Decision 3's own re-arm operation: cancels `reminder`'s own
 * previously-scheduled pending notifications, then schedules one absolute
 * `DATE` trigger per remaining occurrence `computeRemainingOccurrencesToday`
 * returns for `now`. Never throws: a denied permission, a missing native
 * module, or any native-call failure degrades to "the old schedule is
 * cancelled and nothing new is scheduled today" - the same degrade-to-no-op
 * contract `WorkoutReminderService.reschedule()` already documents for its
 * own weekly schedule.
 */
async function scheduleRemainingOccurrencesToday(
  reminder: DailyReminder,
  now: Date,
): Promise<void> {
  await cancelForReminder(reminder.id);

  const occurrences = computeRemainingOccurrencesToday(
    {
      reminderType: reminder.reminderType,
      timeOfDay: reminder.timeOfDay,
      intervalMinutes: reminder.intervalMinutes,
    },
    now,
  );
  if (occurrences.length === 0) {
    return;
  }

  const granted = await requestPermissionIfNeeded();
  if (!granted) {
    return;
  }

  try {
    await ensureAndroidChannel();
    await ensureReminderCategory();
    const prefix = idPrefixFor(reminder.id);
    const data: DailyReminderNotificationData = {
      kind: 'daily-reminder',
      reminderId: reminder.id,
      goalId: reminder.goalId,
    };
    for (const occurrence of occurrences) {
      await Notifications.scheduleNotificationAsync({
        identifier: `${prefix}${occurrence.getTime()}`,
        content: {
          title: reminder.name,
          body: 'Time to check in on this goal.',
          categoryIdentifier: REMINDER_CATEGORY_ID,
          data,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: occurrence,
          channelId: ANDROID_CHANNEL_ID,
        },
      });
    }
  } catch {
    // Degrades to "nothing scheduled" - see this function's own doc comment.
  }
}

export interface HandleNotificationResponseDependencies {
  dailyGoalService: DailyGoalService;
  dailyReminderService: DailyReminderService;
  clock: Clock;
}

/**
 * Inspects a received `NotificationResponse` and, if it carries this
 * module's own `{ kind: 'daily-reminder' }` data payload, writes the tapped
 * action's effect - otherwise a no-op (so this can safely coexist with the
 * rest timer's own deep-link response data, or a plain notification tap,
 * without either mis-routing into the other's handler).
 *
 * Takes every dependency as an explicit parameter (constructor/param
 * injection, matching this module's own container-free style) rather than
 * an internal `useContainer()` call - this is a plain service module, not a
 * React hook, but the same DI discipline applies so it can be tested with no
 * React tree involved.
 *
 * ARCHITECTURE.md section 7.12's exact response semantics: "Zrealizowane" on
 * a goal-linked reminder writes the goal's full completion in one call
 * (`progressValue = 1` for a boolean goal, `progressValue = goal.targetValue`
 * for counter/numeric - a notification action button cannot collect a
 * partial amount), THEN records the reminder response either way; "Nie"
 * never touches goal progress, only the reminder's own response log. Side-
 * effect-only against the two services - no navigation, since this must work
 * with no UI open.
 *
 * Never throws, the same contract as every other function in this module:
 * there is no UI to surface a failure to (this runs from a background
 * notification-response listener), so a write failure against either
 * service is swallowed rather than left to crash whatever process invoked
 * this - the OS-level notification still gets dismissed either way.
 */
async function handleNotificationResponse(
  response: Notifications.NotificationResponse,
  deps: HandleNotificationResponseDependencies,
): Promise<void> {
  const data = response.notification.request.content.data;
  if (!isDailyReminderNotificationData(data)) {
    return;
  }
  if (response.actionIdentifier !== ACTION_DONE && response.actionIdentifier !== ACTION_NOT_DONE) {
    return;
  }

  try {
    const todayLocalDate = deps.clock.localDate();

    if (response.actionIdentifier === ACTION_DONE && data.goalId !== null) {
      const goal = await deps.dailyGoalService.getGoal(data.goalId);
      if (goal) {
        const progressValue = goal.goalType === 'boolean' ? 1 : (goal.targetValue ?? 0);
        await deps.dailyGoalService.recordProgress(data.goalId, todayLocalDate, progressValue);
      }
    }

    const resultResponse = response.actionIdentifier === ACTION_DONE ? 'done' : 'not_done';
    await deps.dailyReminderService.recordResponse(data.reminderId, todayLocalDate, resultResponse);
  } catch {
    // Best-effort write - see this function's own doc comment.
  }
}

export const notificationScheduler = {
  scheduleRemainingOccurrencesToday,
  cancelForReminder,
  requestPermissionIfNeeded,
  handleNotificationResponse,
};

export type NotificationScheduler = typeof notificationScheduler;

/** Test-only escape hatch, mirroring `WorkoutReminderService`'s/`RestTimerNotificationService`'s own - so the Android-channel/category memoization doesn't leak between test cases. Not part of the public API. */
export function __resetAndroidChannelStateForTesting(): void {
  androidChannelEnsured = false;
  categoryEnsured = false;
}
