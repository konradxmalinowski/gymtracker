import { View } from 'react-native';

import { Row } from '@/components/layout';
import { Chip } from '@/components/ui';
import { t } from '@/i18n';

/**
 * Step 0 decision 1 (`plans/2026-08-08-p7-rest-timer.md`): fixed presets,
 * no custom-value entry UI anywhere in this feature - not just in-workout.
 * Shared by `RestTimerSettingsSheet` (in-workout, per-exercise override) and
 * `app/profile/settings/timers.tsx` (the global default), so both surfaces
 * offer literally the same set of choices.
 */
export const REST_TIMER_PRESET_SECONDS = [30, 60, 90, 120, 180] as const;

export interface TimerPresetChipsProps {
  /** The currently selected value, or `null`/an unlisted number if none of the fixed presets match - no chip renders as selected in that case, which is expected (e.g. a value carried over from before this feature existed, or a future manually-migrated value). */
  value: number | null;
  onSelect: (seconds: number) => void;
  testID?: string | undefined;
}

export function TimerPresetChips({ value, onSelect, testID }: TimerPresetChipsProps) {
  return (
    <View testID={testID}>
      <Row gap={2} wrap>
        {REST_TIMER_PRESET_SECONDS.map((seconds) => (
          <Chip
            key={seconds}
            label={t('restTimer.presetChipLabelTemplate', { seconds })}
            selected={value === seconds}
            onPress={() => onSelect(seconds)}
            testID={testID ? `${testID}-preset-${seconds}` : undefined}
          />
        ))}
      </Row>
    </View>
  );
}
