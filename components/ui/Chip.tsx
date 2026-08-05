import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';

import { PressScale } from '@/components/gestures/PressScale';
import { t } from '@/i18n';
import { color, hitSlop, radius, space } from '@/theme/tokens';

import { IconButton } from './IconButton';
import { Text } from './Text';

export type ChipSize = 'sm' | 'md';

export interface ChipProps {
  label: string;
  selected?: boolean | undefined;
  icon?: ReactNode | undefined;
  size?: ChipSize | undefined;
  disabled?: boolean | undefined;
  onPress?: (() => void) | undefined;
  onRemove?: (() => void) | undefined;
  testID?: string | undefined;
}

const SIZE_STYLE: Record<
  ChipSize,
  { height: number; paddingHorizontal: number; textVariant: 'caption' | 'footnote' }
> = {
  sm: { height: 28, paddingHorizontal: space[2], textVariant: 'caption' },
  md: { height: 36, paddingHorizontal: space[3], textVariant: 'footnote' },
};

export function Chip({
  label,
  selected = false,
  icon,
  size = 'md',
  disabled = false,
  onPress,
  onRemove,
  testID,
}: ChipProps) {
  const sizeStyle = SIZE_STYLE[size];

  const containerStyle: ViewStyle = {
    height: sizeStyle.height,
    paddingHorizontal: sizeStyle.paddingHorizontal,
    borderRadius: radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    backgroundColor: selected ? color.accentSubtle : color.surfaceElevated,
    borderWidth: 1,
    borderColor: selected ? color.borderAccent : color.border,
    opacity: disabled ? 0.5 : 1,
    alignSelf: 'flex-start',
  };

  const content = (
    <>
      {icon ? <View>{icon}</View> : null}
      {/* Chip labels sit in a fixed-height pill - truncate rather than
          wrapping or growing the chip unpredictably. */}
      <Text
        variant={sizeStyle.textVariant}
        color={selected ? 'accent' : 'primary'}
        numberOfLines={1}
      >
        {label}
      </Text>
    </>
  );

  const body = onPress ? (
    <PressScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      hitSlop={hitSlop.small}
      style={containerStyle}
      testID={testID}
    >
      {content}
    </PressScale>
  ) : (
    <View style={containerStyle} testID={testID}>
      {content}
    </View>
  );

  if (!onRemove) {
    return body;
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
      {body}
      <IconButton
        icon={<Text color="secondary">{'✕'}</Text>}
        size="sm"
        variant="ghost"
        disabled={disabled}
        accessibilityLabel={t('chip.removeAccessibilityLabel', { label })}
        onPress={onRemove}
      />
    </View>
  );
}
