import { Switch as RNSwitch } from 'react-native';

import { color } from '@/theme/tokens';

export interface SwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean | undefined;
  accessibilityLabel: string;
  testID?: string | undefined;
}

/** Thin token-styled wrapper over RN's `Switch` (ARCHITECTURE.md section 11.7). */
export function Switch({
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
  testID,
}: SwitchProps) {
  return (
    <RNSwitch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ false: color.surfaceElevated, true: color.accentSubtle }}
      thumbColor={value ? color.accent : color.textTertiary}
      ios_backgroundColor={color.surfaceElevated}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, checked: value }}
      testID={testID}
    />
  );
}
