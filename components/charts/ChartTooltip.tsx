import { View } from 'react-native';

import { Text } from '@/components/ui';
import { color, radius, space } from '@/theme/tokens';

export interface ChartTooltipProps {
  label: string;
  value: string;
  testID?: string | undefined;
}

/**
 * ADR-0010's `ChartTooltip` adapter - a static positioned label (e.g. a
 * chart's "latest point" annotation). This phase ships static charts only
 * (plan decision 8); wiring this to a drag gesture via `useChartPressState`
 * is a real, scoped follow-up, not attempted half-finished here.
 */
export function ChartTooltip({ label, value, testID }: ChartTooltipProps) {
  return (
    <View
      testID={testID}
      style={{
        alignSelf: 'flex-start',
        backgroundColor: color.surfaceElevated,
        borderRadius: radius.md,
        paddingHorizontal: space[3],
        paddingVertical: space[2],
        gap: 2,
      }}
    >
      <Text variant="caption" color="tertiary">
        {label}
      </Text>
      <Text variant="bodyMedium" color="primary">
        {value}
      </Text>
    </View>
  );
}
