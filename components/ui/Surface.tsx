import type { PropsWithChildren } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { color, radius, space } from '@/theme/tokens';

export type SurfaceLevel = 0 | 1 | 2 | 3;

const LEVEL_BACKGROUND: Record<SurfaceLevel, string> = {
  0: color.background,
  1: color.surface,
  2: color.surfaceElevated,
  3: color.surfacePressed,
};

export interface SurfaceProps extends PropsWithChildren {
  level: SurfaceLevel;
  radius?: keyof typeof radius | undefined;
  padding?: keyof typeof space | undefined;
  style?: StyleProp<ViewStyle> | undefined;
}

/**
 * The lowest-level building block of the surface ladder (ARCHITECTURE.md
 * section 11.2) - purely a background-color + optional radius/padding box,
 * no border, no shadow, no interactivity. `Card` and `ListRow` build on top
 * of this for the decisions that actually vary by use (borders, press
 * feedback, elevation).
 */
export function Surface({ level, radius: radiusKey, padding, style, children }: SurfaceProps) {
  return (
    <View
      style={[
        { backgroundColor: LEVEL_BACKGROUND[level] },
        radiusKey !== undefined ? { borderRadius: radius[radiusKey] } : null,
        padding !== undefined ? { padding: space[padding] } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}
