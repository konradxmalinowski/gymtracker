import type { ReactNode } from 'react';
import { View } from 'react-native';

import { space } from '@/theme/tokens';

import { Text } from './Text';

export interface SectionHeaderProps {
  title: string;
  action?: ReactNode | undefined;
}

/** `accessibilityRole="header"` lets screen readers jump section-to-section. */
export function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: space[4],
        paddingBottom: space[2],
      }}
    >
      <Text variant="title3" color="primary" accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
      {action}
    </View>
  );
}
