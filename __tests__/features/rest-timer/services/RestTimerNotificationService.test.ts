import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import {
  __resetAndroidChannelStateForTesting,
  REST_TIMER_DEEP_LINK,
  restTimerNotificationService,
} from '@/features/rest-timer/services/RestTimerNotificationService';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  AndroidImportance: { HIGH: 4 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  PermissionStatus: { GRANTED: 'granted', UNDETERMINED: 'undetermined', DENIED: 'denied' },
}));

const mockNotifications = Notifications as jest.Mocked<typeof Notifications>;

const originalPlatformOS = Platform.OS;

/**
 * `expo-notifications` mocked at the module boundary - same pattern this
 * project already uses for `expo-image-picker` in the onboarding suite
 * (`__tests__/features/onboarding/screens/OnboardingScreen.test.tsx`), a
 * native surface jest-expo has no real implementation for.
 */
beforeEach(() => {
  __resetAndroidChannelStateForTesting();
  Platform.OS = 'ios';
  mockNotifications.getPermissionsAsync.mockResolvedValue({
    granted: true,
    canAskAgain: true,
    expires: 'never',
    status: Notifications.PermissionStatus.GRANTED,
  } as Notifications.NotificationPermissionsStatus);
  mockNotifications.requestPermissionsAsync.mockResolvedValue({
    granted: true,
    canAskAgain: true,
    expires: 'never',
    status: Notifications.PermissionStatus.GRANTED,
  } as Notifications.NotificationPermissionsStatus);
  mockNotifications.setNotificationChannelAsync.mockResolvedValue(null);
  mockNotifications.scheduleNotificationAsync.mockResolvedValue('notification-id-1');
  mockNotifications.cancelScheduledNotificationAsync.mockResolvedValue(undefined);
});

afterEach(() => {
  Platform.OS = originalPlatformOS;
});

function permissionStatus(
  overrides: Partial<Notifications.NotificationPermissionsStatus>,
): Notifications.NotificationPermissionsStatus {
  return {
    granted: false,
    canAskAgain: true,
    expires: 'never',
    status: Notifications.PermissionStatus.UNDETERMINED,
    ...overrides,
  } as Notifications.NotificationPermissionsStatus;
}

describe('requestPermissionIfNeeded', () => {
  it('returns true and never prompts when permission is already granted', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue(permissionStatus({ granted: true }));

    const result = await restTimerNotificationService.requestPermissionIfNeeded();

    expect(result).toBe(true);
    expect(mockNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('returns false and does not re-prompt when denied with canAskAgain false', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue(
      permissionStatus({ granted: false, canAskAgain: false }),
    );

    const result = await restTimerNotificationService.requestPermissionIfNeeded();

    expect(result).toBe(false);
    expect(mockNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('prompts and returns true when not yet asked and the user grants it', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue(
      permissionStatus({ granted: false, canAskAgain: true }),
    );
    mockNotifications.requestPermissionsAsync.mockResolvedValue(
      permissionStatus({ granted: true }),
    );

    const result = await restTimerNotificationService.requestPermissionIfNeeded();

    expect(result).toBe(true);
    expect(mockNotifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('prompts and returns false when not yet asked and the user denies it', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue(
      permissionStatus({ granted: false, canAskAgain: true }),
    );
    mockNotifications.requestPermissionsAsync.mockResolvedValue(
      permissionStatus({ granted: false, canAskAgain: false }),
    );

    const result = await restTimerNotificationService.requestPermissionIfNeeded();

    expect(result).toBe(false);
  });

  it('never throws - swallows a native getPermissionsAsync rejection and returns false', async () => {
    mockNotifications.getPermissionsAsync.mockRejectedValue(new Error('native module missing'));

    await expect(restTimerNotificationService.requestPermissionIfNeeded()).resolves.toBe(false);
  });
});

describe('scheduleRestNotification', () => {
  it('short-circuits without touching permissions when notificationsEnabled is false', async () => {
    const result = await restTimerNotificationService.scheduleRestNotification(
      Date.now() + 60_000,
      60,
      false,
    );

    expect(result).toBeNull();
    expect(mockNotifications.getPermissionsAsync).not.toHaveBeenCalled();
    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('schedules and returns the notification id when permission is already granted', async () => {
    const deadlineAt = 1_700_000_060_000;

    const result = await restTimerNotificationService.scheduleRestNotification(
      deadlineAt,
      90,
      true,
    );

    expect(result).toBe('notification-id-1');
    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          data: { url: REST_TIMER_DEEP_LINK },
        }),
        trigger: expect.objectContaining({
          date: deadlineAt,
        }),
      }),
    );
  });

  it('returns null and never calls the native scheduler when permission is denied', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue(
      permissionStatus({ granted: false, canAskAgain: false }),
    );

    const result = await restTimerNotificationService.scheduleRestNotification(
      Date.now() + 60_000,
      60,
      true,
    );

    expect(result).toBeNull();
    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('never throws - swallows a native scheduleNotificationAsync rejection and returns null', async () => {
    mockNotifications.scheduleNotificationAsync.mockRejectedValue(new Error('scheduling failed'));

    await expect(
      restTimerNotificationService.scheduleRestNotification(Date.now() + 60_000, 60, true),
    ).resolves.toBeNull();
  });

  it('ensures the Android channel only once across repeated calls, and only on Android', async () => {
    Platform.OS = 'android';

    await restTimerNotificationService.scheduleRestNotification(Date.now() + 60_000, 60, true);
    await restTimerNotificationService.scheduleRestNotification(Date.now() + 120_000, 60, true);

    expect(mockNotifications.setNotificationChannelAsync).toHaveBeenCalledTimes(1);
  });

  it('never sets up the Android channel on iOS', async () => {
    Platform.OS = 'ios';

    await restTimerNotificationService.scheduleRestNotification(Date.now() + 60_000, 60, true);

    expect(mockNotifications.setNotificationChannelAsync).not.toHaveBeenCalled();
  });

  it('re-ensures the Android channel after a test resets the memoization flag (isolation sanity check)', async () => {
    Platform.OS = 'android';
    await restTimerNotificationService.scheduleRestNotification(Date.now() + 60_000, 60, true);
    expect(mockNotifications.setNotificationChannelAsync).toHaveBeenCalledTimes(1);

    __resetAndroidChannelStateForTesting();
    await restTimerNotificationService.scheduleRestNotification(Date.now() + 60_000, 60, true);
    expect(mockNotifications.setNotificationChannelAsync).toHaveBeenCalledTimes(2);
  });
});

describe('cancelScheduledNotification', () => {
  it('calls through to the native cancel with the given id', async () => {
    await restTimerNotificationService.cancelScheduledNotification('notification-id-1');

    expect(mockNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      'notification-id-1',
    );
  });

  it('never throws - swallows a native cancel rejection', async () => {
    mockNotifications.cancelScheduledNotificationAsync.mockRejectedValue(
      new Error('already fired'),
    );

    await expect(
      restTimerNotificationService.cancelScheduledNotification('notification-id-1'),
    ).resolves.toBeUndefined();
  });
});
