import type { ReactNode } from 'react';
import { View } from 'react-native';

import { PressScale } from '@/components/gestures/PressScale';
import { color, space } from '@/theme/tokens';

import { Text } from './Text';

export interface ListRowProps {
  title: string;
  subtitle?: string | undefined;
  leading?: ReactNode | undefined;
  trailing?: ReactNode | undefined;
  onPress?: (() => void) | undefined;
  showChevron?: boolean | undefined;
  destructive?: boolean | undefined;
  disabled?: boolean | undefined;
  /** Mirrors `Button.tsx`'s `loading` prop's `accessibilityState.busy` wiring - set while a row-triggered async action (e.g. a mutation) is in flight, so a screen reader announces "busy" rather than leaving `disabled` as the only (unexplained) signal something changed. */
  busy?: boolean | undefined;
  testID?: string | undefined;
}

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  showChevron = false,
  destructive = false,
  disabled = false,
  busy = false,
  testID,
}: ListRowProps) {
  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 56,
        paddingVertical: space[3],
        paddingHorizontal: space[4],
        gap: space[3],
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {leading ? <View>{leading}</View> : null}
      <View style={{ flex: 1 }}>
        <Text variant="body" color={destructive ? 'danger' : 'primary'} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="footnote" color="secondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View>{trailing}</View> : null}
      {showChevron ? (
        <Text color="tertiary" accessibilityElementsHidden importantForAccessibility="no">
          {'›'}
        </Text>
      ) : null}
    </View>
  );

  if (!onPress) {
    return (
      <View style={{ borderBottomWidth: 1, borderBottomColor: color.border }} testID={testID}>
        {content}
      </View>
    );
  }

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: color.border }}>
      <PressScale
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
        accessibilityState={{ disabled, busy }}
        testID={testID}
      >
        {content}
      </PressScale>
    </View>
  );
}
