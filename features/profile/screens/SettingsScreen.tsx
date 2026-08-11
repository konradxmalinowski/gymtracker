import { router } from 'expo-router';

import { Column, Screen } from '@/components/layout';
import { ListRow, Surface, Switch } from '@/components/ui';
import { useHapticsSetting, useUnitsSettings } from '@/features/profile/hooks/useSettings';
import { t } from '@/i18n';
import { routes } from '@/navigation/routes';
import { space } from '@/theme/tokens';

/** `app/profile/settings/index.tsx`'s screen body. */
export function SettingsScreen() {
  const { enabled: hapticsEnabled, isPending: hapticsPending, setEnabled } = useHapticsSetting();
  const { weightUnit, lengthUnit } = useUnitsSettings();

  const unitsSubtitle =
    weightUnit && lengthUnit
      ? t('profileSettings.unitsRowSubtitleTemplate', { weight: weightUnit, length: lengthUnit })
      : undefined;

  return (
    <Screen scroll edges={['bottom']} testID="settings-screen">
      <Column gap={6} style={{ paddingVertical: space[6] }}>
        <Surface level={1} radius="lg">
          <ListRow
            title={t('profileSettings.unitsRowTitle')}
            subtitle={unitsSubtitle}
            onPress={() => router.push(routes.profileSettings.units())}
            showChevron
            testID="settings-units-row"
          />
          <ListRow
            title={t('profileSettings.hapticsRowTitle')}
            subtitle={t('profileSettings.hapticsRowSubtitle')}
            trailing={
              <Switch
                value={hapticsEnabled ?? true}
                onValueChange={setEnabled}
                disabled={hapticsPending}
                accessibilityLabel={t('profileSettings.hapticsRowTitle')}
                testID="settings-haptics-switch"
              />
            }
          />
          <ListRow
            title={t('profileSettings.timersRowTitle')}
            onPress={() => router.push(routes.profileSettings.timers())}
            showChevron
            testID="settings-timers-row"
          />
          <ListRow
            title={t('profileSettings.aboutRowTitle')}
            onPress={() => router.push(routes.profileSettings.about())}
            showChevron
            testID="settings-about-row"
          />
        </Surface>
      </Column>
    </Screen>
  );
}
