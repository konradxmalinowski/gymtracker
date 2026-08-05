import { View } from 'react-native';

import { color, radius, space } from '@/theme/tokens';

import { Text } from './Text';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
export type BadgeSize = 'sm' | 'md';

const TONE_STYLE: Record<
  BadgeTone,
  { background: string; text: 'primary' | 'accent' | 'success' | 'danger' }
> = {
  neutral: { background: color.surfaceElevated, text: 'primary' },
  accent: { background: color.accentSubtle, text: 'accent' },
  success: { background: color.successSubtle, text: 'success' },
  warning: { background: color.dangerSubtle, text: 'primary' },
  danger: { background: color.dangerSubtle, text: 'danger' },
};

const SIZE_STYLE: Record<
  BadgeSize,
  { height: number; paddingHorizontal: number; textVariant: 'caption' | 'footnote' }
> = {
  sm: { height: 20, paddingHorizontal: space[2], textVariant: 'caption' },
  md: { height: 24, paddingHorizontal: space[2], textVariant: 'footnote' },
};

/** A non-interactive label pill - `accessibilityRole="text"` so it's read as a single unit, not tapped as a control. */
export function Badge({
  label,
  tone = 'neutral',
  size = 'md',
}: {
  label: string;
  tone?: BadgeTone;
  size?: BadgeSize;
}) {
  const toneStyle = TONE_STYLE[tone];
  const sizeStyle = SIZE_STYLE[size];

  return (
    <View
      accessibilityRole="text"
      style={{
        height: sizeStyle.height,
        paddingHorizontal: sizeStyle.paddingHorizontal,
        borderRadius: radius.full,
        backgroundColor: toneStyle.background,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'flex-start',
      }}
    >
      <Text variant={sizeStyle.textVariant} color={toneStyle.text} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
