import type { SeriesPoint } from './types';

export interface SeriesSummary {
  count: number;
  min: number;
  max: number;
}

/**
 * Reduces a chart's own already-loaded `SeriesPoint[]` into `{count, min,
 * max}` over its non-null points, for building a non-visual accessibility
 * summary label at the call site (`ChartCard`'s `contentAccessibilityLabel`)
 * - `LineChartView`/`BarChartView` render through `victory-native`'s Skia
 * canvas, which has no native accessibility surface of its own, so without
 * this the chart is a silent dead zone for VoiceOver/TalkBack. Returns
 * `null` when every point is `null` - callers should already be routing
 * that case to `ChartCard`'s own empty state instead of calling this.
 * Lives in `components/charts` (not a feature) since it operates only on
 * the adapter's own generic `SeriesPoint` shape, no domain knowledge.
 */
export function summarizeSeries(data: readonly SeriesPoint[]): SeriesSummary | null {
  const values = data
    .map((point) => point.value)
    .filter((value): value is number => value !== null);
  if (values.length === 0) {
    return null;
  }
  return { count: values.length, min: Math.min(...values), max: Math.max(...values) };
}
