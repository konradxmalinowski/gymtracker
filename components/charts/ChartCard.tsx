import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Section, Surface, Text } from '@/components/ui';
import { EmptyState, Skeleton } from '@/components/feedback';
import { space } from '@/theme/tokens';

export interface ChartCardProps {
  title: string;
  subtitle?: string | undefined;
  isPending: boolean;
  isEmpty: boolean;
  emptyIcon?: ReactNode | undefined;
  emptyTitle: string;
  emptyMessage: string;
  children: ReactNode;
  /**
   * A non-visual summary of the chart's actual data (e.g. "Volume chart, 12
   * periods, ranging from 1200 to 3400 kg"), read as one VoiceOver/TalkBack
   * stop in place of the underlying canvas/SVG chart content, which has no
   * native accessibility surface of its own (`LineChartView`/`BarChartView`
   * render through `victory-native`'s Skia canvas; `HeatmapView`'s
   * individual day cells aren't independently meaningful either). Omit this
   * for chart content that is already independently accessible - e.g.
   * `StackedBarChartView`'s real per-row `Text` labels/values - passing it
   * there would collapse those rows into one opaque node, the same
   * `SwipeableRow`-style collapse this project's other accessibility
   * reviews (P7/P8) have repeatedly flagged and fixed elsewhere.
   */
  contentAccessibilityLabel?: string | undefined;
  /**
   * A persistent axis-unit label (e.g. "kg", "workouts", "min") shown next
   * to the chart for as long as it's visible - distinct from
   * victory-native's own per-tick `formatYLabel` values (e.g. "120 kg"),
   * which scroll past with the chart data and are easy to miss at a
   * glance. A user glancing at the chart for one second should be able to
   * tell what's being measured without hunting down a specific tick.
   * Omit for chart content that already conveys its unit persistently on
   * its own - e.g. `StackedBarChartView`'s real per-row value labels.
   */
  unitLabel?: string | undefined;
  testID?: string | undefined;
}

/**
 * The chart adapter's card shell (ADR-0010): title, an optional subtitle,
 * and the three required states every chart needs (loading skeleton, real
 * empty state, actual chart) - never a chart library import here, only
 * layout and the loading/empty presentation.
 *
 * ARCHITECTURE.md section 10's component table lists this with `range`/
 * `onRangeChange` props of its own; shipped shape moves range selection to
 * a single screen-level `StatRangeSelector` instead (this phase's plan),
 * since every chart on a Statistics screen shares one range - a per-card
 * selector would be redundant UI, not a richer one.
 */
export function ChartCard({
  title,
  subtitle,
  isPending,
  isEmpty,
  emptyIcon,
  emptyTitle,
  emptyMessage,
  children,
  contentAccessibilityLabel,
  unitLabel,
  testID,
}: ChartCardProps) {
  return (
    <Section title={title}>
      {subtitle ? (
        <Text
          variant="footnote"
          color="secondary"
          style={{ paddingHorizontal: space[4], marginTop: -space[1] }}
        >
          {subtitle}
        </Text>
      ) : null}
      <Surface level={1} radius="lg" padding={4} style={{ minHeight: 200 }}>
        {isPending ? (
          <View
            style={{ gap: space[2], justifyContent: 'center', flex: 1 }}
            accessibilityLabel={title}
            accessibilityLiveRegion="polite"
          >
            <Skeleton width="100%" height={160} radius="md" />
          </View>
        ) : isEmpty ? (
          <EmptyState
            illustration={emptyIcon}
            title={emptyTitle}
            message={emptyMessage}
            testID={testID ? `${testID}-empty` : undefined}
          />
        ) : (
          <View style={{ gap: space[1] }}>
            {unitLabel ? (
              <Text
                variant="caption"
                color="tertiary"
                style={{ paddingLeft: space[1] }}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                {unitLabel}
              </Text>
            ) : null}
            <View
              testID={testID}
              {...(contentAccessibilityLabel
                ? {
                    accessible: true,
                    accessibilityRole: 'image' as const,
                    accessibilityLabel: contentAccessibilityLabel,
                  }
                : {})}
            >
              {children}
            </View>
          </View>
        )}
      </Surface>
    </Section>
  );
}
