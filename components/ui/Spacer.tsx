import { View } from 'react-native';

import { space } from '@/theme/tokens';

export interface SpacerProps {
  size: keyof typeof space;
  axis?: 'vertical' | 'horizontal' | undefined;
}

/** A layout-only gap. Prefer a container's `gap` style where possible; this exists for the cases that can't use one (e.g. inside `ScrollView` content that isn't flex-gap-friendly across the RN versions this app supports). */
export function Spacer({ size, axis = 'vertical' }: SpacerProps) {
  const dimension = space[size];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={axis === 'vertical' ? { height: dimension } : { width: dimension }}
    />
  );
}
