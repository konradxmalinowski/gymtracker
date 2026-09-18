import { useEffect, useMemo } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AccessibilityInfo } from 'react-native';
import { Stack } from 'expo-router';

import { ChartCard, LineChartView, summarizeSeries } from '@/components/charts';
import { Column, Row, Screen } from '@/components/layout';
import { Card, IconButton, Text } from '@/components/ui';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback';
import { haptics } from '@/services/haptics';
import { t } from '@/i18n';
import { useSheetStore } from '@/stores/sheetStore';
import { useToastStore } from '@/stores/toastStore';
import { color } from '@/theme/tokens';

import type { BodyMetricType } from '../domain/metrics';
import { MeasurementQuickEntrySheetContent } from '../components/MeasurementQuickEntrySheetContent';
import { formatBodyMetricsDate } from '../components/formatBodyMetricsDate';
import { formatMetricHistoryAxisLabel } from '../components/formatMetricHistoryAxisLabel';
import { metricLabel } from '../components/metricPresentation';
import { useDisplayUnits } from '../hooks/useDisplayUnits';
import {
  useDeleteMetricEntry,
  useMetricHistory,
  useRestoreMetricEntry,
} from '../hooks/useBodyMetrics';
import { displayUnitLabel, formatDisplayValue, toDisplayValue } from '../hooks/metricUnits';
import type { EntityId } from '@/repositories/contracts/repository';

const QUICK_ENTRY_SHEET_ID = 'body-metrics-quick-entry';

export interface MetricHistoryScreenProps {
  metric: BodyMetricType | undefined;
}

/** `app/body-metrics/[metric].tsx`'s screen body. */
export function MetricHistoryScreen({ metric }: MetricHistoryScreenProps) {
  const { data: entries, isPending, isError, refetch } = useMetricHistory(metric);
  const { weightUnit, lengthUnit } = useDisplayUnits();
  const deleteEntry = useDeleteMetricEntry();
  const restoreEntry = useRestoreMetricEntry();

  const isEmpty = !isPending && !isError && (!entries || entries.length === 0);
  const title = metric ? metricLabel(metric) : '';
  const unit = metric ? displayUnitLabel(metric, weightUnit ?? 'kg', lengthUnit ?? 'cm') : '';

  const chartPoints = useMemo(() => {
    if (!metric || !entries) {
      return [];
    }
    // `listHistory` returns newest-first; the chart reads oldest-first left
    // to right. `x` stays the raw `YYYY-MM-DD` `localDate` here (not
    // `formatBodyMetricsDate`'s pre-formatted string) so `LineChartView`'s
    // `formatX` can render it as a short axis tick label - the same
    // raw-value-in/formatted-label-out shape every `statistics` chart uses.
    return [...entries].reverse().map((entry) => ({
      x: entry.localDate,
      value: toDisplayValue(metric, entry.value, weightUnit ?? 'kg', lengthUnit ?? 'cm'),
    }));
  }, [metric, entries, weightUnit, lengthUnit]);

  const summary = summarizeSeries(chartPoints);

  useEffect(() => {
    if (isPending) {
      AccessibilityInfo.announceForAccessibility(t('common.loading'));
    } else if (isEmpty) {
      AccessibilityInfo.announceForAccessibility(t('bodyMetrics.history.emptyTitle'));
    }
  }, [isPending, isEmpty]);

  function openQuickEntry() {
    if (!metric) return;
    useSheetStore.getState().present({
      id: QUICK_ENTRY_SHEET_ID,
      content: (
        <MeasurementQuickEntrySheetContent
          metric={metric}
          onSaved={() => useSheetStore.getState().dismissCurrent()}
        />
      ),
      snapPoints: [0.5],
    });
  }

  function handleDelete(id: EntityId) {
    if (!metric) return;
    haptics.destructive();
    deleteEntry.mutate({ id, metric });
    useToastStore.getState().show({
      message: t('bodyMetrics.history.deleteUndoMessage'),
      actionLabel: t('common.undo'),
      onAction: () => restoreEntry.mutate({ id, metric }),
    });
  }

  return (
    <Screen scroll testID="body-metrics-history-screen" edges={['bottom']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title,
          headerStyle: { backgroundColor: color.background },
          headerTintColor: color.textPrimary,
          headerShadowVisible: false,
          headerRight: () => (
            <IconButton
              icon={<Ionicons name="add" size={20} color={color.accent} />}
              variant="ghost"
              accessibilityLabel={t('bodyMetrics.history.addAccessibilityLabelTemplate', {
                metric: title,
              })}
              onPress={openQuickEntry}
              testID="body-metrics-history-add-button"
            />
          ),
        }}
      />
      <Column gap={4}>
        {metric ? (
          <ChartCard
            title={title}
            isPending={isPending}
            isEmpty={isEmpty}
            emptyIcon={<Ionicons name="analytics-outline" size={32} color={color.textTertiary} />}
            emptyTitle={t('bodyMetrics.history.emptyTitle')}
            emptyMessage={t('bodyMetrics.history.emptyMessage')}
            unitLabel={unit}
            contentAccessibilityLabel={
              summary
                ? t('bodyMetrics.history.chartAccessibilityLabelTemplate', {
                    metric: title,
                    count: summary.count,
                    min: summary.min.toFixed(1),
                    max: summary.max.toFixed(1),
                    unit,
                  })
                : undefined
            }
            testID="body-metrics-history-chart"
          >
            <LineChartView
              data={chartPoints}
              formatX={formatMetricHistoryAxisLabel}
              formatY={(value) => `${value.toFixed(0)} ${unit}`}
            />
          </ChartCard>
        ) : null}

        {isPending ? (
          <Column gap={2}>
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} width="100%" height={56} radius="lg" />
            ))}
          </Column>
        ) : null}

        {isError ? (
          <ErrorState error={t('bodyMetrics.history.loadErrorMessage')} onRetry={() => refetch()} />
        ) : null}

        {isEmpty ? (
          <EmptyState
            illustration={
              <Ionicons name="clipboard-outline" size={40} color={color.textTertiary} />
            }
            title={t('bodyMetrics.history.emptyTitle')}
            message={t('bodyMetrics.history.emptyMessage')}
            testID="body-metrics-history-empty-state"
          />
        ) : null}

        {!isPending && !isError && entries && entries.length > 0 && metric
          ? entries.map((entry) => {
              const dateLabel = formatBodyMetricsDate(entry.measuredAt);
              const valueLabel = formatDisplayValue(
                metric,
                entry.value,
                weightUnit ?? 'kg',
                lengthUnit ?? 'cm',
              );
              return (
                <Card key={entry.id} variant="outlined">
                  <Row justify="space-between" align="center">
                    <Column gap={1}>
                      <Text variant="numeric" color="primary">
                        {valueLabel} {unit}
                      </Text>
                      <Text variant="footnote" color="secondary">
                        {dateLabel}
                      </Text>
                      {entry.note ? (
                        <Text variant="footnote" color="tertiary">
                          {entry.note}
                        </Text>
                      ) : null}
                    </Column>
                    <IconButton
                      icon={<Ionicons name="trash-outline" size={18} color={color.danger} />}
                      variant="ghost"
                      accessibilityLabel={t(
                        'bodyMetrics.history.deleteAccessibilityLabelTemplate',
                        {
                          date: dateLabel,
                        },
                      )}
                      onPress={() => handleDelete(entry.id)}
                      testID={`body-metrics-history-delete-${entry.id}`}
                    />
                  </Row>
                </Card>
              );
            })
          : null}
      </Column>
    </Screen>
  );
}
