import { View } from 'react-native';

import { Column } from '@/components/layout';
import { Text } from '@/components/ui';
import { t } from '@/i18n';
import { space } from '@/theme/tokens';

import { formatRestSeconds } from './formatRestSeconds';
import { TimerPresetChips } from './TimerPresetChips';

export interface RestTimerSettingsSheetProps {
  /** The exercise's current `rest_seconds_override` (Pass 2 guarantees this is always resolved to a concrete value by add/start time - never `null` in practice, but the prop stays nullable so a genuinely unresolved caller state renders "no selection" instead of a wrong one). */
  currentSeconds: number | null;
  onSelectPreset: (seconds: number) => void;
  testID?: string | undefined;
}

/**
 * Screen-body content for `app/(modals)/rest-timer-settings.tsx` (Step 0
 * decision 4: the in-workout settings surface, current exercise's override
 * plus the fixed presets). Named "Sheet" per the plan's own naming even
 * though it renders inside a full router modal, not a `BottomSheet` -
 * matching the modal-route precedent `app/(modals)/exercise-picker.tsx`
 * already established (a plain `Stack.Screen` with `presentation: 'modal'`,
 * not this app's in-place `BottomSheet` component).
 */
export function RestTimerSettingsSheet({
  currentSeconds,
  onSelectPreset,
  testID,
}: RestTimerSettingsSheetProps) {
  return (
    <View testID={testID}>
      <Column gap={4} style={{ paddingTop: space[4] }}>
        <Column gap={1}>
          <Text variant="footnote" color="secondary">
            {t('restTimer.settingsSheet.currentLabel')}
          </Text>
          <Text variant="title2" color="primary" testID={testID ? `${testID}-current` : undefined}>
            {currentSeconds === null
              ? t('restTimer.settingsSheet.noneLabel')
              : formatRestSeconds(currentSeconds)}
          </Text>
        </Column>

        <Column gap={2}>
          <Text variant="label" color="secondary">
            {t('restTimer.settingsSheet.presetsTitle')}
          </Text>
          <TimerPresetChips
            value={currentSeconds}
            onSelect={onSelectPreset}
            testID={testID ? `${testID}-presets` : undefined}
          />
        </Column>
      </Column>
    </View>
  );
}
