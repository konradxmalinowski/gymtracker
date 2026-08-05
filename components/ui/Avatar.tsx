import { Image, Pressable, View } from 'react-native';

import { t } from '@/i18n';
import { color, hitSlop, radius } from '@/theme/tokens';

import { Text } from './Text';

export type AvatarSize = 'sm' | 'md' | 'lg';

const SIZE_PX: Record<AvatarSize, number> = { sm: 32, md: 48, lg: 72 };
const SIZE_TEXT_VARIANT: Record<AvatarSize, 'caption' | 'callout' | 'title2'> = {
  sm: 'caption',
  md: 'callout',
  lg: 'title2',
};

export interface AvatarProps {
  uri?: string | undefined;
  name: string;
  size?: AvatarSize | undefined;
  editable?: boolean | undefined;
  onPress?: (() => void) | undefined;
  testID?: string | undefined;
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

export function Avatar({ uri, name, size = 'md', editable = false, onPress, testID }: AvatarProps) {
  const dimension = SIZE_PX[size];
  const accessibilityLabel = t('avatar.accessibilityLabel', { name });

  const body = (
    <View
      style={{
        width: dimension,
        height: dimension,
        borderRadius: radius.full,
        backgroundColor: color.surfaceElevated,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: dimension, height: dimension }}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text variant={SIZE_TEXT_VARIANT[size]} color="secondary">
          {initialsFrom(name)}
        </Text>
      )}
    </View>
  );

  if (!editable && !onPress) {
    return (
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
        testID={testID}
      >
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        editable ? `${accessibilityLabel}. ${t('common.edit')}` : accessibilityLabel
      }
      hitSlop={hitSlop.small}
      testID={testID}
    >
      {body}
    </Pressable>
  );
}
