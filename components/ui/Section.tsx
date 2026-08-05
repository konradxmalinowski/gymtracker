import type { PropsWithChildren } from 'react';
import { View } from 'react-native';

import { space } from '@/theme/tokens';

import { SectionHeader, type SectionHeaderProps } from './SectionHeader';

export interface SectionProps extends PropsWithChildren, Partial<SectionHeaderProps> {}

/** Groups a `SectionHeader` with its content; renders no header at all if `title` is omitted. */
export function Section({ title, action, children }: SectionProps) {
  return (
    <View style={{ gap: space[2] }}>
      {title ? <SectionHeader title={title} action={action} /> : null}
      {children}
    </View>
  );
}
