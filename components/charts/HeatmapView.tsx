import { ScrollView } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { color } from '@/theme/tokens';

export interface HeatmapDay {
  localDate: string;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface HeatmapViewProps {
  days: readonly HeatmapDay[];
  /**
   * A non-visual summary of the heatmap's actual data (e.g. "2026 training
   * activity heatmap, 42 training days") - required, not defaulted, since
   * this adapter has no domain knowledge of its own to build one from
   * (`components/charts` never imports `t()` content it can't already see);
   * the caller (`YearlyHeatmapCard`) has the real year/day data and must
   * supply a real, translated label. Individual day cells are not
   * separately reachable - 365+ per-day VoiceOver/TalkBack stops would be
   * worse than one summary, and the grid isn't interactive (no `onPress`
   * anywhere in this feature).
   */
  accessibilityLabel: string;
  testID?: string | undefined;
}

const CELL_SIZE = 11;
const CELL_GAP = 3;
const CELL_STEP = CELL_SIZE + CELL_GAP;

const LEVEL_COLOR: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: color.chartGrid,
  1: 'rgba(61,220,132,0.28)',
  2: 'rgba(61,220,132,0.52)',
  3: 'rgba(61,220,132,0.76)',
  4: color.success,
};

/**
 * ADR-0010's `HeatmapView` adapter - "custom, react-native-svg" per the
 * ARCHITECTURE.md component table (Victory Native XL has no heatmap chart
 * type). Lays `days` out GitHub-contribution-graph style: one column per
 * ISO week (Monday-first), one row per weekday - `days` is expected to
 * already be a complete, gap-free year (`computeYearlyHeatmap`'s contract).
 */
export function HeatmapView({ days, accessibilityLabel, testID }: HeatmapViewProps) {
  if (days.length === 0) {
    return null;
  }

  const firstWeekday = (parseWeekday(days[0]!.localDate) + 6) % 7; // 0 = Monday
  const weekCount = Math.ceil((firstWeekday + days.length) / 7);
  const width = weekCount * CELL_STEP;
  const height = 7 * CELL_STEP;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} testID={testID}>
      <Svg width={width} height={height} accessibilityLabel={accessibilityLabel}>
        {days.map((day, index) => {
          const gridIndex = index + firstWeekday;
          const week = Math.floor(gridIndex / 7);
          const weekday = gridIndex % 7;
          return (
            <Rect
              key={day.localDate}
              x={week * CELL_STEP}
              y={weekday * CELL_STEP}
              width={CELL_SIZE}
              height={CELL_SIZE}
              rx={2}
              fill={LEVEL_COLOR[day.level]}
            />
          );
        })}
      </Svg>
    </ScrollView>
  );
}

function parseWeekday(localDate: string): number {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay(); // 0 = Sunday
}
