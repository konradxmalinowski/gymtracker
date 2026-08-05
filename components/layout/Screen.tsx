import type { PropsWithChildren } from 'react';
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { color, space } from '@/theme/tokens';

export interface ScreenProps extends PropsWithChildren {
  scroll?: boolean | undefined;
  padded?: boolean | undefined;
  edges?: readonly Edge[] | undefined;
  style?: StyleProp<ViewStyle> | undefined;
  testID?: string | undefined;
}

/**
 * Every top-level route body renders through this instead of a bare
 * `SafeAreaView` - one place that sets the app-wide background color and
 * horizontal screen padding, so no route invents its own.
 */
export function Screen({
  scroll = false,
  padded = true,
  edges = ['top', 'bottom'],
  style,
  testID,
  children,
}: ScreenProps) {
  const contentStyle: StyleProp<ViewStyle> = [
    { flex: 1 },
    padded ? { paddingHorizontal: space[4] } : null,
    style,
  ];

  return (
    <SafeAreaView
      edges={edges}
      style={{ flex: 1, backgroundColor: color.background }}
      testID={testID}
    >
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={padded ? { paddingHorizontal: space[4] } : undefined}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={contentStyle}>{children}</View>
      )}
    </SafeAreaView>
  );
}
