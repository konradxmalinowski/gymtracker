import type { PropsWithChildren, ReactElement } from 'react';
import {
  ScrollView,
  View,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { color, space } from '@/theme/tokens';

export interface ScreenProps extends PropsWithChildren {
  scroll?: boolean | undefined;
  padded?: boolean | undefined;
  edges?: readonly Edge[] | undefined;
  style?: StyleProp<ViewStyle> | undefined;
  /**
   * P10: pull-to-refresh, `ScrollView`'s own `refreshControl` prop passed
   * straight through - Home is the first screen in the app needing it.
   * Ignored when `scroll` is false (there is no `ScrollView` to attach it
   * to); build a real `<RefreshControl refreshing={...} onRefresh={...} />`
   * at the call site, this prop just forwards it.
   */
  refreshControl?: ReactElement<RefreshControlProps> | undefined;
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
  refreshControl,
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
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={contentStyle}>{children}</View>
      )}
    </SafeAreaView>
  );
}
