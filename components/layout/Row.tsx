import type { PropsWithChildren } from 'react';
import { View, type FlexAlignType, type StyleProp, type ViewStyle } from 'react-native';

import { space } from '@/theme/tokens';

export interface RowProps extends PropsWithChildren {
  gap?: keyof typeof space | undefined;
  align?: FlexAlignType | undefined;
  justify?: ViewStyle['justifyContent'] | undefined;
  wrap?: boolean | undefined;
  style?: StyleProp<ViewStyle> | undefined;
}

export function Row({ gap, align, justify, wrap = false, style, children }: RowProps) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          flexWrap: wrap ? 'wrap' : 'nowrap',
          alignItems: align,
          justifyContent: justify,
          gap: gap !== undefined ? space[gap] : undefined,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
