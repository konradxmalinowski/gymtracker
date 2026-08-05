import { View } from 'react-native';

import { color, space } from '@/theme/tokens';

export interface DividerProps {
  orientation?: 'horizontal' | 'vertical' | undefined;
  inset?: keyof typeof space | undefined;
}

/** A layout hairline, never a focusable/announced element. */
export function Divider({ orientation = 'horizontal', inset }: DividerProps) {
  const marginKey = inset !== undefined ? space[inset] : 0;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={
        orientation === 'horizontal'
          ? { height: 1, backgroundColor: color.border, marginHorizontal: marginKey }
          : {
              width: 1,
              backgroundColor: color.border,
              marginVertical: marginKey,
              alignSelf: 'stretch',
            }
      }
    />
  );
}
