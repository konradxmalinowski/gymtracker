import type { PropsWithChildren } from 'react';
import { View, type FlexAlignType, type StyleProp, type ViewStyle } from 'react-native';

import { space } from '@/theme/tokens';

export interface ColumnProps extends PropsWithChildren {
  gap?: keyof typeof space | undefined;
  align?: FlexAlignType | undefined;
  justify?: ViewStyle['justifyContent'] | undefined;
  style?: StyleProp<ViewStyle> | undefined;
}

export function Column({ gap, align, justify, style, children }: ColumnProps) {
  return (
    <View
      style={[
        {
          flexDirection: 'column',
          alignItems: align,
          justifyContent: justify,
        },
        gap !== undefined ? { gap: space[gap] } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}
