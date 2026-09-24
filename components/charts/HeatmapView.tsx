import { ScrollView, View } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

import { Text } from '@/components/ui';
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
  /**
   * Palette override, keyed by the same `0-4` level a day carries - defaults
   * to the shared green training-intensity ramp. Passing a full custom map
   * repurposes this same grid-layout renderer for a different fixed-tier
   * scale (e.g. the sleep table's red/yellow/green) without duplicating the
   * SVG week/weekday math for what is otherwise an identical layout.
   */
  colors?: Record<0 | 1 | 2 | 3 | 4, string> | undefined;
  testID?: string | undefined;
}

const CELL_SIZE = 11;
const CELL_GAP = 3;
const CELL_STEP = CELL_SIZE + CELL_GAP;
/** Room above the grid for month labels - GitHub's own contribution graph reserves the same kind of header row. */
const HEADER_HEIGHT = 16;
/** Fixed (non-scrolling) column to the left of the grid for the Mon/Wed/Fri weekday labels. */
const WEEKDAY_LABEL_WIDTH = 24;

const LEVEL_COLOR: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: color.chartGrid,
  1: 'rgba(61,220,132,0.28)',
  2: 'rgba(61,220,132,0.52)',
  3: 'rgba(61,220,132,0.76)',
  4: color.success,
};

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** GitHub shows only every-other weekday label (Mon/Wed/Fri) to avoid a cramped column - `weekday` here is the same "0 = Monday" index the grid layout below uses. */
const WEEKDAY_LABEL: Partial<Record<number, string>> = { 0: 'Mon', 2: 'Wed', 4: 'Fri' };

/**
 * ADR-0010's `HeatmapView` adapter - "custom, react-native-svg" per the
 * ARCHITECTURE.md component table (Victory Native XL has no heatmap chart
 * type). Lays `days` out GitHub-contribution-graph style: one column per
 * ISO week (Monday-first), one row per weekday - `days` is expected to
 * already be a complete, gap-free year (`computeYearlyHeatmap`'s contract).
 *
 * Also mirrors GitHub's own graph chrome, per direct user feedback that the
 * grid alone ("no time markers") read as illegible without it: a month-label
 * row above the grid (scrolls together with it, inside the same `Svg`) and a
 * fixed Mon/Wed/Fri weekday column to its left (outside the horizontal
 * `ScrollView`, so it stays put while the grid scrolls).
 */
export function HeatmapView({
  days,
  accessibilityLabel,
  colors = LEVEL_COLOR,
  testID,
}: HeatmapViewProps) {
  if (days.length === 0) {
    return null;
  }

  const firstWeekday = (parseWeekday(days[0]!.localDate) + 6) % 7; // 0 = Monday
  const weekCount = Math.ceil((firstWeekday + days.length) / 7);
  const gridWidth = weekCount * CELL_STEP;
  const gridHeight = 7 * CELL_STEP;
  const monthLabels = computeMonthLabels(days, firstWeekday);

  return (
    <View style={{ flexDirection: 'row' }} testID={testID}>
      <View style={{ width: WEEKDAY_LABEL_WIDTH, paddingTop: HEADER_HEIGHT }}>
        {([0, 1, 2, 3, 4, 5, 6] as const).map((weekday) => (
          <View key={weekday} style={{ height: CELL_STEP, justifyContent: 'center' }}>
            {WEEKDAY_LABEL[weekday] ? (
              <Text variant="caption" color="tertiary">
                {WEEKDAY_LABEL[weekday]}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
      {/* `flex: 1` is required, not cosmetic - without it, a horizontal
          `ScrollView` as a flex-row item sizes itself to its content's full
          intrinsic width (the whole year) instead of the row's remaining
          space, so it never becomes a bounded scroll viewport - the grid
          just gets clipped by the card's own edge with nothing to scroll. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
        <Svg
          width={gridWidth}
          height={HEADER_HEIGHT + gridHeight}
          accessibilityLabel={accessibilityLabel}
        >
          {monthLabels.map(({ week, label }) => (
            <SvgText
              key={`${label}-${week}`}
              x={week * CELL_STEP}
              y={HEADER_HEIGHT - 5}
              fontSize={10}
              fill={color.textTertiary}
            >
              {label}
            </SvgText>
          ))}
          {days.map((day, index) => {
            const gridIndex = index + firstWeekday;
            const week = Math.floor(gridIndex / 7);
            const weekday = gridIndex % 7;
            return (
              <Rect
                key={day.localDate}
                x={week * CELL_STEP}
                y={HEADER_HEIGHT + weekday * CELL_STEP}
                width={CELL_SIZE}
                height={CELL_SIZE}
                rx={2}
                fill={colors[day.level]}
              />
            );
          })}
        </Svg>
      </ScrollView>
    </View>
  );
}

interface MonthLabel {
  week: number;
  label: string;
}

/** One label per calendar month, positioned above the week-column its 1st falls into - skipped if that would land within 3 weeks of the previous label (guards the rare case of a short first partial week at the grid's very start). */
function computeMonthLabels(
  days: readonly HeatmapDay[],
  firstWeekday: number,
): readonly MonthLabel[] {
  const labels: MonthLabel[] = [];
  let lastLabeledWeek = -Infinity;
  days.forEach((day, index) => {
    if (day.localDate.slice(8, 10) !== '01') {
      return;
    }
    const week = Math.floor((index + firstWeekday) / 7);
    if (week - lastLabeledWeek < 3) {
      return;
    }
    const monthIndex = Number(day.localDate.slice(5, 7)) - 1;
    labels.push({ week, label: MONTH_LABELS[monthIndex]! });
    lastLabeledWeek = week;
  });
  return labels;
}

function parseWeekday(localDate: string): number {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay(); // 0 = Sunday
}
