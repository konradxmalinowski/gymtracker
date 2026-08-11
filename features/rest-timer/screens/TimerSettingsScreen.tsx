import { useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';

import { Column, Screen } from '@/components/layout';
import { Skeleton } from '@/components/feedback';
import { ListRow, Surface, Switch, Text } from '@/components/ui';
import { t } from '@/i18n';
import { space } from '@/theme/tokens';

import { TimerPresetChips } from '../components/TimerPresetChips';
import { useTimerSettings } from '../hooks/useTimerSettings';

/**
 * `app/profile/settings/timers.tsx`'s screen body (Step 0 decision 4's
 * standalone global-defaults screen). Not re-exported from the `rest-timer`
 * barrel for the same `import/no-cycle` reason `useTimerSettings.ts`'s own
 * doc comment gives - `app/profile/settings/timers.tsx` imports this
 * directly by path instead, the same convention every other `app/` route
 * wrapper in this codebase already follows.
 */
export function TimerSettingsScreen() {
  const {
    defaultRestSeconds,
    sound,
    vibration,
    notification,
    autoStart,
    isPending,
    setDefaultRestSeconds,
    setSound,
    setVibration,
    setNotification,
    setAutoStart,
  } = useTimerSettings();

  useEffect(() => {
    if (isPending) {
      AccessibilityInfo.announceForAccessibility(t('common.loading'));
    }
  }, [isPending]);

  return (
    <Screen scroll edges={['bottom']} testID="timer-settings-screen">
      <Column gap={6} style={{ paddingVertical: space[6] }}>
        {isPending ? (
          <TimerSettingsSkeleton />
        ) : (
          <>
            <Column gap={2}>
              <Text variant="label" color="secondary">
                {t('restTimer.timerSettings.defaultRestTitle')}
              </Text>
              <TimerPresetChips
                value={defaultRestSeconds ?? null}
                onSelect={setDefaultRestSeconds}
                testID="timer-settings-default-rest-presets"
              />
            </Column>

            <Surface level={1} radius="lg">
              <ListRow
                title={t('restTimer.timerSettings.soundRowTitle')}
                trailing={
                  <Switch
                    value={sound ?? true}
                    onValueChange={setSound}
                    accessibilityLabel={t('restTimer.timerSettings.soundRowTitle')}
                    testID="timer-settings-sound-switch"
                  />
                }
              />
              <ListRow
                title={t('restTimer.timerSettings.vibrationRowTitle')}
                trailing={
                  <Switch
                    value={vibration ?? true}
                    onValueChange={setVibration}
                    accessibilityLabel={t('restTimer.timerSettings.vibrationRowTitle')}
                    testID="timer-settings-vibration-switch"
                  />
                }
              />
              <ListRow
                title={t('restTimer.timerSettings.notificationRowTitle')}
                subtitle={t('restTimer.timerSettings.notificationRowSubtitle')}
                trailing={
                  <Switch
                    value={notification ?? true}
                    onValueChange={setNotification}
                    accessibilityLabel={t('restTimer.timerSettings.notificationRowTitle')}
                    testID="timer-settings-notification-switch"
                  />
                }
              />
              <ListRow
                title={t('restTimer.timerSettings.autoStartRowTitle')}
                subtitle={t('restTimer.timerSettings.autoStartRowSubtitle')}
                trailing={
                  <Switch
                    value={autoStart ?? true}
                    onValueChange={setAutoStart}
                    accessibilityLabel={t('restTimer.timerSettings.autoStartRowTitle')}
                    testID="timer-settings-autostart-switch"
                  />
                }
              />
            </Surface>
          </>
        )}
      </Column>
    </Screen>
  );
}

function TimerSettingsSkeleton() {
  return (
    <Column gap={4}>
      <Skeleton width="40%" height={16} />
      <Skeleton width="100%" height={40} radius="md" />
      <Skeleton width="100%" height={200} radius="lg" />
    </Column>
  );
}
