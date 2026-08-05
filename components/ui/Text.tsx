import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { color as colorTokens, font } from '@/theme/tokens';

export type TextVariant =
  | 'display'
  | 'title1'
  | 'title2'
  | 'title3'
  | 'body'
  | 'bodyMedium'
  | 'callout'
  | 'subhead'
  | 'footnote'
  | 'caption'
  | 'numeric'
  | 'numericLarge'
  | 'label';

export type TextColor =
  'primary' | 'secondary' | 'tertiary' | 'accent' | 'success' | 'danger' | 'inverse';

const COLOR_MAP: Record<TextColor, string> = {
  primary: colorTokens.textPrimary,
  secondary: colorTokens.textSecondary,
  tertiary: colorTokens.textTertiary,
  accent: colorTokens.accentText,
  success: colorTokens.success,
  danger: colorTokens.danger,
  inverse: colorTokens.textInverse,
};

// numeric/numericLarge get `fontVariant: ['tabular-nums']` per
// ARCHITECTURE.md section 11.4 - without it the rest timer's digits jitter
// as they count down and set-row columns fail to align.
const VARIANT_STYLE: Record<TextVariant, TextStyle> = {
  display: {
    fontSize: font.size.display,
    lineHeight: font.lineHeight.display,
    fontWeight: font.weight.bold,
    letterSpacing: font.tracking.tight,
  },
  title1: {
    fontSize: font.size.title1,
    lineHeight: font.lineHeight.title1,
    fontWeight: font.weight.bold,
    letterSpacing: font.tracking.tight,
  },
  title2: {
    fontSize: font.size.title2,
    lineHeight: font.lineHeight.title2,
    fontWeight: font.weight.semibold,
  },
  title3: {
    fontSize: font.size.title3,
    lineHeight: font.lineHeight.title3,
    fontWeight: font.weight.semibold,
  },
  body: {
    fontSize: font.size.body,
    lineHeight: font.lineHeight.body,
    fontWeight: font.weight.regular,
  },
  bodyMedium: {
    fontSize: font.size.body,
    lineHeight: font.lineHeight.body,
    fontWeight: font.weight.medium,
  },
  callout: {
    fontSize: font.size.callout,
    lineHeight: font.lineHeight.callout,
    fontWeight: font.weight.regular,
  },
  subhead: {
    fontSize: font.size.subhead,
    lineHeight: font.lineHeight.subhead,
    fontWeight: font.weight.regular,
  },
  footnote: {
    fontSize: font.size.footnote,
    lineHeight: font.lineHeight.footnote,
    fontWeight: font.weight.regular,
  },
  caption: {
    fontSize: font.size.caption,
    lineHeight: font.lineHeight.caption,
    fontWeight: font.weight.regular,
    letterSpacing: font.tracking.wide,
  },
  numeric: {
    fontSize: font.size.body,
    lineHeight: font.lineHeight.body,
    fontWeight: font.weight.semibold,
    fontVariant: ['tabular-nums'],
  },
  numericLarge: {
    fontSize: font.size.numeric,
    lineHeight: font.lineHeight.numeric,
    fontWeight: font.weight.bold,
    fontVariant: ['tabular-nums'],
    letterSpacing: font.tracking.tight,
  },
  label: {
    fontSize: font.size.footnote,
    lineHeight: font.lineHeight.footnote,
    fontWeight: font.weight.medium,
    letterSpacing: font.tracking.wide,
  },
};

export interface TextProps extends Omit<RNTextProps, 'style'> {
  variant?: TextVariant | undefined;
  color?: TextColor | undefined;
  align?: 'left' | 'center' | 'right' | undefined;
  style?: RNTextProps['style'] | undefined;
}

/**
 * The base text primitive every other component composes instead of a raw
 * RN `<Text>`, so every font size/weight/line-height/tracking decision in
 * the app traces back to `theme/tokens.ts`.
 */
export function Text({
  variant = 'body',
  color = 'primary',
  align,
  numberOfLines,
  style,
  ...rest
}: TextProps) {
  return (
    <RNText
      numberOfLines={numberOfLines}
      // Long, untruncated text should still wrap rather than silently
      // overflowing its container when a caller doesn't pass
      // `numberOfLines` - `ellipsizeMode` only matters once a limit exists.
      ellipsizeMode={numberOfLines !== undefined ? 'tail' : undefined}
      style={[
        VARIANT_STYLE[variant],
        { color: COLOR_MAP[color] },
        align ? { textAlign: align } : null,
        style,
      ]}
      {...rest}
    />
  );
}
