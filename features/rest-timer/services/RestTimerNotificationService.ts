/**
 * `expo-notifications` scheduling wrapper for the rest timer (R-04 /
 * `docs/ARCHITECTURE.md` line ~1879): the deadline is always scheduled as an
 * absolute OS-level notification, never a relative delay or a JS timer, so it
 * still fires under Android Doze/battery optimization and app backgrounding.
 *
 * This module owns no settings/repository dependency (`features/rest-timer`
 * must stay a leaf per ARCHITECTURE.md section 9.1 - `workout-logging` is the
 * only feature allowed to depend on it, never the reverse). Every "should
 * this even schedule anything" decision (`timer.notification` off) is passed
 * in by the caller as a plain boolean rather than read from settings here.
 *
 * Permission is requested lazily (Step 0 decision 3 in
 * `plans/2026-08-08-p7-rest-timer.md`): the first time a real workout would
 * actually schedule a notification, not proactively during onboarding or from
 * a settings screen. `scheduleRestNotification` is that call site - it drives
 * `requestPermissionIfNeeded()` itself so callers never have to sequence the
 * two.
 *
 * Every method degrades to a no-op rather than throwing (denied permission,
 * an unavailable native module, a rejected native call): a rest timer that
 * cannot schedule an OS notification still has to keep ticking in-app, per
 * this phase's explicit acceptance criteria, not fail the set-completion flow
 * that triggered it.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Nav rules table target (`docs/ARCHITECTURE.md` section 10.2) for the
 * notification's tap target. `app.config.ts` already registers `scheme:
 * "gymtracker"` (confirmed by reading it directly, not assumed) so the deep
 * link itself is resolvable - nothing in this pass wires up the tap handler
 * that reads this back off the notification response, see this pass's report
 * for why that's a pass-3 concern, not this file's.
 */
export const REST_TIMER_DEEP_LINK = 'gymtracker://workout/active';

const ANDROID_CHANNEL_ID = 'rest-timer';
const ANDROID_CHANNEL_NAME = 'Rest Timer';

let androidChannelEnsured = false;

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android' || androidChannelEnsured) {
    return;
  }
  // HIGH is required, not decorative: anything below it is allowed to stay
  // silent/heads-up-free while the screen is off, which defeats R-04's whole
  // point of a rest timer that alerts a backgrounded, Doze-throttled device.
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: ANDROID_CHANNEL_NAME,
    importance: Notifications.AndroidImportance.HIGH,
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  androidChannelEnsured = true;
}

/**
 * Checks current permission first and only prompts the OS dialog if the user
 * has never been asked (`canAskAgain`) - re-prompting a user who already said
 * no is not "lazy", it is nagging, and iOS/Android both suppress the native
 * dialog silently in that case anyway (this check makes the suppression
 * explicit rather than relying on the OS to no-op it).
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

/**
 * Schedules a local notification for the absolute instant `deadlineAt`
 * (epoch ms - matches `active_session_state.timer_deadline_at`'s own unit,
 * so pass 2 can pass that column's value straight through). Returns the
 * scheduled notification's id for pass 2 to persist as
 * `active_session_state.timer_notification_id`, or `null` if nothing was
 * scheduled (notifications off, permission not granted, or the native call
 * itself failed) - never throws.
 */
async function scheduleRestNotification(
  deadlineAt: number,
  totalSeconds: number,
  notificationsEnabled: boolean,
): Promise<string | null> {
  if (!notificationsEnabled) {
    return null;
  }
  const granted = await requestPermissionIfNeeded();
  if (!granted) {
    return null;
  }
  try {
    await ensureAndroidChannel();
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Rest timer finished',
        body: `Your ${totalSeconds}s rest is up - time for the next set.`,
        data: { url: REST_TIMER_DEEP_LINK },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: deadlineAt,
        channelId: ANDROID_CHANNEL_ID,
      },
    });
  } catch {
    return null;
  }
}

/**
 * Cancels a previously scheduled notification - the schema comment on
 * `active_session_state.timer_notification_id` documents "cancelled on early
 * finish" as this call's one caller. Cancelling an id that already fired or
 * was already cancelled is not an error worth surfacing, so this swallows
 * rather than throws.
 */
async function cancelScheduledNotification(notificationId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // Best-effort cleanup - see doc comment above.
  }
}

export const restTimerNotificationService = {
  requestPermissionIfNeeded,
  scheduleRestNotification,
  cancelScheduledNotification,
};

/** Test-only escape hatch so the Android-channel memoization doesn't leak between test cases. Not part of the public API (not re-exported from index.ts). */
export function __resetAndroidChannelStateForTesting(): void {
  androidChannelEnsured = false;
}
