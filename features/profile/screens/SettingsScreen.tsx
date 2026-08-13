import { useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';

import { Column, Screen } from '@/components/layout';
import { ListRow, Surface, Switch } from '@/components/ui';
import { ConfirmDialog } from '@/components/feedback';
import { useRebuildRecords } from '@/features/records';
import {
  useHapticsSetting,
  useShowEstimatedCaloriesSetting,
  useUnitsSettings,
} from '@/features/profile/hooks/useSettings';
import { t } from '@/i18n';
import { routes } from '@/navigation/routes';
import { useContainer } from '@/services/container';
import { useToastStore } from '@/stores/toastStore';
import { color, space } from '@/theme/tokens';

/** `app/profile/settings/index.tsx`'s screen body. */
export function SettingsScreen() {
  const { recordService } = useContainer();
  const { enabled: hapticsEnabled, isPending: hapticsPending, setEnabled } = useHapticsSetting();
  const { weightUnit, lengthUnit } = useUnitsSettings();
  const {
    enabled: estimatedCaloriesEnabled,
    isPending: estimatedCaloriesPending,
    setEnabled: setEstimatedCaloriesEnabled,
  } = useShowEstimatedCaloriesSetting();
  const rebuildRecords = useRebuildRecords(recordService);

  const [confirmRebuildVisible, setConfirmRebuildVisible] = useState(false);

  // `ListRow` + a bare `ActivityIndicator` had no `busy` accessibility state
  // and no "why did this row just become unavailable" signal for a
  // screen-reader user (accessibility report A11Y-P8-004, mirroring
  // `Button.tsx`'s already-solved `loading` prop). `ListRow`'s `busy` prop
  // (new, this pass) covers the `accessibilityState` half; this one-time
  // announcement on the pending transition covers the "in progress" wording
  // the row's own static title/subtitle never surfaces.
  useEffect(() => {
    if (rebuildRecords.isPending) {
      AccessibilityInfo.announceForAccessibility(t('records.recalculate.inProgressLabel'));
    }
  }, [rebuildRecords.isPending]);

  const unitsSubtitle =
    weightUnit && lengthUnit
      ? t('profileSettings.unitsRowSubtitleTemplate', { weight: weightUnit, length: lengthUnit })
      : undefined;

  async function handleConfirmRebuild() {
    setConfirmRebuildVisible(false);
    try {
      await rebuildRecords.mutateAsync();
      useToastStore.getState().show({ message: t('records.recalculate.successMessage') });
    } catch {
      useToastStore.getState().show({ message: t('records.recalculate.errorMessage') });
    }
  }

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
            title={t('profileSettings.timersRowTitle')}
            onPress={() => router.push(routes.profileSettings.timers())}
            showChevron
            testID="settings-timers-row"
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
            title={t('profileSettings.progressionRowTitle')}
            subtitle={t('profileSettings.progressionRowSubtitle')}
            onPress={() => router.push(routes.profileSettings.progression())}
            showChevron
            testID="settings-progression-row"
          />
          <ListRow
            title={t('profileSettings.estimatedCaloriesRowTitle')}
            subtitle={t('profileSettings.estimatedCaloriesRowSubtitle')}
            trailing={
              <Switch
                value={estimatedCaloriesEnabled ?? false}
                onValueChange={setEstimatedCaloriesEnabled}
                disabled={estimatedCaloriesPending}
                accessibilityLabel={t('profileSettings.estimatedCaloriesRowTitle')}
                testID="settings-estimated-calories-switch"
              />
            }
          />
          <ListRow
            title={t('records.recalculate.rowTitle')}
            subtitle={t('records.recalculate.rowSubtitle')}
            onPress={() => setConfirmRebuildVisible(true)}
            disabled={rebuildRecords.isPending}
            busy={rebuildRecords.isPending}
            trailing={
              rebuildRecords.isPending ? (
                <ActivityIndicator
                  color={color.textTertiary}
                  accessibilityLabel={t('records.recalculate.inProgressLabel')}
                />
              ) : undefined
            }
            testID="settings-recalculate-records-row"
          />
          <ListRow
            title={t('profileSettings.aboutRowTitle')}
            onPress={() => router.push(routes.profileSettings.about())}
            showChevron
            testID="settings-about-row"
          />
        </Surface>
      </Column>

      <ConfirmDialog
        visible={confirmRebuildVisible}
        title={t('records.recalculate.confirmTitle')}
        message={t('records.recalculate.confirmMessage')}
        confirmLabel={t('records.recalculate.confirmButtonLabel')}
        onConfirm={() => void handleConfirmRebuild()}
        onCancel={() => setConfirmRebuildVisible(false)}
        testID="settings-recalculate-records-confirm-dialog"
      />
    </Screen>
  );
}
