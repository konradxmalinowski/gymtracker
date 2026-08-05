/**
 * services/haptics/haptics.ts
 *
 * Semantic haptics wrapper (ARCHITECTURE.md section 11.6). Callers never
 * touch `expo-haptics` constants directly - the mapping from "what happened"
 * to "which Expo Haptics call" is defined once, here:
 *
 * | Semantic call                | Expo API                                          |
 * |-------------------------------|---------------------------------------------------|
 * | `haptics.setCompleted()`      | `notificationAsync(Success)`                      |
 * | `haptics.personalRecord()`    | `notificationAsync(Success)` + impact 120ms later  |
 * | `haptics.adjust()`            | `impactAsync(Light)`                               |
 * | `haptics.select()`            | `selectionAsync()`                                 |
 * | `haptics.destructive()`       | `notificationAsync(Warning)`                       |
 * | `haptics.timerFinished()`     | `notificationAsync(Success)` + vibration pattern   |
 *
 * Every call is a no-op when the user has disabled haptics
 * (`isHapticsEnabled()`, see settings.ts for why that's a provisional local
 * read rather than a real settings feature). The check lives inside the
 * service, not at every call site, per the architecture doc.
 */
import * as ExpoHaptics from 'expo-haptics';
import { Platform, Vibration } from 'react-native';

import { isHapticsEnabled } from './settings';

function guard(run: () => void | Promise<void>): void {
  if (!isHapticsEnabled()) {
    return;
  }
  void run();
}

async function setCompleted(): Promise<void> {
  await ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Success);
}

async function personalRecord(): Promise<void> {
  await ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Success);
  await new Promise((resolve) => setTimeout(resolve, 120));
  await ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Medium);
}

async function adjust(): Promise<void> {
  await ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light);
}

async function select(): Promise<void> {
  await ExpoHaptics.selectionAsync();
}

async function destructive(): Promise<void> {
  await ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Warning);
}

async function timerFinished(): Promise<void> {
  await ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Success);
  // Expo Haptics has no repeating-pattern primitive; the platform vibration
  // pattern the architecture doc calls for (rest timer expiry needs to be
  // noticeable even if the phone is face-down and unattended) goes through
  // React Native's Vibration API. iOS ignores custom patterns and vibrates
  // once regardless - the notificationAsync above already covers it there.
  if (Platform.OS === 'android') {
    Vibration.vibrate([0, 120, 80, 120]);
  }
}

export const haptics = {
  setCompleted: () => guard(setCompleted),
  personalRecord: () => guard(personalRecord),
  adjust: () => guard(adjust),
  select: () => guard(select),
  destructive: () => guard(destructive),
  timerFinished: () => guard(timerFinished),
};
