import Ionicons from '@expo/vector-icons/Ionicons';

import {
  BarChartView,
  ChartCard,
  LineChartView,
  summarizeSeries,
  type SeriesPoint,
} from '@/components/charts';
import {
  enumerateLocalDates,
  isWeekdayActive,
  parseLocalDate,
  weekdayIndexOf,
  type DailyGoalEntry,
  type GoalType,
} from '@/features/daily-goals';
import { t } from '@/i18n';
import { color } from '@/theme/tokens';

/** One completion-rate bucket for a `boolean` goal's chart - a run of consecutive `local_date`s, never split across the 30-day window's edges. */
const COMPLETION_BUCKET_SIZE_DAYS = 7;

export interface GoalProgressChartCardProps {
  goalType: GoalType;
  /** Free-text label ('kroki', 'ml', 'min') shown as a `counter`/`numeric` chart's y-axis suffix - `null` renders bare numbers. */
  unit: string | null;
  activeWeekdays: number;
  entries: readonly DailyGoalEntry[] | undefined;
  isPending: boolean;
  /** The exact `[from, to]` `local_date` bounds `entries` was queried for (`useGoalProgress`'s own window) - every date in range is plotted, not just the ones with a logged entry. */
  from: string;
  to: string;
  testID?: string | undefined;
}

/** `en-US` short date, matching `features/statistics/components/formatChartAxisLabel.ts`'s exact day-bucket format - duplicated rather than imported, since `statistics` doesn't barrel-export it and `daily-goals` stays a dependency-free leaf (ARCHITECTURE.md section 9.1). */
function formatShortDate(localDate: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(parseLocalDate(localDate)),
  );
}

/**
 * One completion-rate point per `COMPLETION_BUCKET_SIZE_DAYS`-day bucket:
 * `completedDays / activeDays * 100` over just the days this goal was
 * actually scheduled for (`activeWeekdays`) - a bucket with no active day at
 * all (a goal only active on, say, Sundays, with `COMPLETION_BUCKET_SIZE_DAYS`
 * `<` 7 would never hit this, but stays defensive) renders as a gap (`null`),
 * never a misleading 0%.
 */
function buildCompletionBuckets(
  dates: readonly string[],
  activeWeekdays: number,
  entryByDate: ReadonlyMap<string, DailyGoalEntry>,
): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  for (let start = 0; start < dates.length; start += COMPLETION_BUCKET_SIZE_DAYS) {
    const bucketDates = dates.slice(start, start + COMPLETION_BUCKET_SIZE_DAYS);
    let activeDays = 0;
    let completedDays = 0;
    for (const localDate of bucketDates) {
      if (!isWeekdayActive(activeWeekdays, weekdayIndexOf(localDate))) {
        continue;
      }
      activeDays += 1;
      const entry = entryByDate.get(localDate);
      if (entry && entry.progressValue >= 1) {
        completedDays += 1;
      }
    }
    points.push({
      x: bucketDates[0] as string,
      value: activeDays > 0 ? (completedDays / activeDays) * 100 : null,
    });
  }
  return points;
}

/** One point per calendar day - `progressValue` when logged, `null` (a real gap, never a dip to zero) when this goal has no entry for that day. */
function buildValueSeries(
  dates: readonly string[],
  entryByDate: ReadonlyMap<string, DailyGoalEntry>,
): SeriesPoint[] {
  return dates.map((localDate) => ({
    x: localDate,
    value: entryByDate.get(localDate)?.progressValue ?? null,
  }));
}

/**
 * `GoalFormScreen`'s edit-mode-only progress chart (this pass) - a
 * completion-rate trend for `boolean` goals (raw daily 0/1 values are
 * illegible noise over 30 days, so this buckets into weekly completion
 * percentages instead) and a raw daily value-over-time line for `counter`/
 * `numeric` goals, where every logged number is itself the signal. Follows
 * `features/statistics/components/VolumeChartCard.tsx`'s exact
 * `ChartCard`-plus-`summarizeSeries`-accessibility-label shape.
 */
export function GoalProgressChartCard({
  goalType,
  unit,
  activeWeekdays,
  entries,
  isPending,
  from,
  to,
  testID,
}: GoalProgressChartCardProps) {
  // A freshly created goal has no history at all yet - render the shared
  // empty state rather than a completion chart showing a flat, misleading
  // 0% (or a value chart with every point a gap), matching
  // `VolumeChartCard`'s own "nothing to plot yet" treatment.
  const isEmpty = !entries || entries.length === 0;
  const dates = enumerateLocalDates(from, to);
  const entryByDate = new Map((entries ?? []).map((entry) => [entry.localDate, entry] as const));

  const title =
    goalType === 'boolean'
      ? t('dailyGoals.form.progressChartCompletionTitle')
      : t('dailyGoals.form.progressChartValueTitle');
  const subtitle =
    goalType === 'boolean'
      ? t('dailyGoals.form.progressChartCompletionSubtitle')
      : t('dailyGoals.form.progressChartValueSubtitle');

  if (goalType === 'boolean') {
    const points = buildCompletionBuckets(dates, activeWeekdays, entryByDate);
    const summary = summarizeSeries(points);

    return (
      <ChartCard
        title={title}
        subtitle={subtitle}
        isPending={isPending}
        isEmpty={isEmpty}
        emptyIcon={<Ionicons name="stats-chart-outline" size={32} color={color.textTertiary} />}
        emptyTitle={t('dailyGoals.form.progressChartEmptyTitle')}
        emptyMessage={t('dailyGoals.form.progressChartEmptyMessage')}
        contentAccessibilityLabel={
          summary
            ? t('dailyGoals.form.progressChartCompletionAccessibilityLabelTemplate', {
                count: summary.count,
                min: Math.round(summary.min),
                max: Math.round(summary.max),
              })
            : undefined
        }
        testID={testID}
      >
        <BarChartView
          data={points}
          formatX={formatShortDate}
          formatY={(value) => `${Math.round(value)}%`}
          color={color.chart[0]}
        />
      </ChartCard>
    );
  }

  const points = buildValueSeries(dates, entryByDate);
  const summary = summarizeSeries(points);

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      isPending={isPending}
      isEmpty={isEmpty}
      emptyIcon={<Ionicons name="stats-chart-outline" size={32} color={color.textTertiary} />}
      emptyTitle={t('dailyGoals.form.progressChartEmptyTitle')}
      emptyMessage={t('dailyGoals.form.progressChartEmptyMessage')}
      contentAccessibilityLabel={
        summary
          ? t('dailyGoals.form.progressChartValueAccessibilityLabelTemplate', {
              count: summary.count,
              min: Math.round(summary.min),
              max: Math.round(summary.max),
            })
          : undefined
      }
      testID={testID}
    >
      <LineChartView
        data={points}
        formatX={formatShortDate}
        formatY={(value) => (unit ? `${value} ${unit}` : `${value}`)}
        color={color.chart[0]}
      />
    </ChartCard>
  );
}
