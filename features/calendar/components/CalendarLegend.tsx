import { View } from 'react-native';

import { Text } from '@/components/ui';
import { t } from '@/i18n';
import { color, radius, space } from '@/theme/tokens';

import { CALENDAR_LEVEL_BACKGROUND } from './calendarIntensityColors';
import type { HeatmapLevel } from '../domain/intensityBinning';

export interface CalendarLegendProps {
  testID?: string | undefined;
}

const LEVELS: HeatmapLevel[] = [0, 1, 2, 3, 4];

/**
 * A small, static "Less -> More" swatch strip explaining the intensity
 * color scale used by both `CalendarDayCell` (month view) and `HeatmapView`
 * (year view) - not interactive, no data of its own, so it needs no query.
 */
export function CalendarLegend({ testID }: CalendarLegendProps) {
  return (
    <View
      accessible
      accessibilityLabel={t('calendar.legend.title')}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}
      testID={testID}
    >
      <Text variant="caption" color="tertiary">
        {t('calendar.legend.lessLabel')}
      </Text>
      {LEVELS.map((level) => (
        <View
          key={level}
          style={{
            width: 12,
            height: 12,
            borderRadius: radius.sm,
            backgroundColor: CALENDAR_LEVEL_BACKGROUND[level],
            borderWidth: level === 0 ? 1 : 0,
            borderColor: color.border,
          }}
        />
      ))}
      <Text variant="caption" color="tertiary">
        {t('calendar.legend.moreLabel')}
      </Text>
    </View>
  );
}
