import { useEffect, useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { AccessibilityInfo, View } from 'react-native';
import { router } from 'expo-router';

import { Column, Screen } from '@/components/layout';
import { IconButton, ListRow, Surface, Text } from '@/components/ui';
import { ErrorState, Skeleton } from '@/components/feedback';
import { t } from '@/i18n';
import { routes } from '@/navigation/routes';
import { useSheetStore } from '@/stores/sheetStore';
import { color, space } from '@/theme/tokens';

import { BODY_METRIC_TYPES, type BodyMetricType } from '../domain/metrics';
import { MeasurementQuickEntrySheetContent } from '../components/MeasurementQuickEntrySheetContent';
import { formatBodyMetricsDate } from '../components/formatBodyMetricsDate';
import { metricIconName, metricLabel } from '../components/metricPresentation';
import { useDisplayUnits } from '../hooks/useDisplayUnits';
import { useLatestMetricValues } from '../hooks/useBodyMetrics';
import { displayUnitLabel, formatDisplayValue } from '../hooks/metricUnits';
import type { LatestMetricValue } from '../types/BodyMetric';

const QUICK_ENTRY_SHEET_ID = 'body-metrics-quick-entry';

/** `app/body-metrics/index.tsx`'s screen body. */
export function MeasurementsListScreen() {
  const { data: latestValues, isPending, isError, refetch } = useLatestMetricValues();
  const { weightUnit, lengthUnit } = useDisplayUnits();

  const latestByMetric = useMemo(() => {
    const map = new Map<BodyMetricType, LatestMetricValue>();
    for (const entry of latestValues ?? []) {
      map.set(entry.metric, entry);
    }
    return map;
  }, [latestValues]);

  useEffect(() => {
    if (isPending) {
      AccessibilityInfo.announceForAccessibility(t('common.loading'));
    }
  }, [isPending]);

  function openQuickEntry(metric: BodyMetricType) {
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

  return (
    <Screen scroll testID="body-metrics-list-screen" padded={false} edges={['bottom']}>
      <Column gap={6} style={{ padding: space[4] }}>
        {isPending ? (
          <Column gap={3}>
            {[0, 1, 2, 3].map((row) => (
              <Skeleton key={row} width="100%" height={64} radius="lg" />
            ))}
          </Column>
        ) : null}

        {isError ? (
          <ErrorState error={t('bodyMetrics.list.loadErrorMessage')} onRetry={() => refetch()} />
        ) : null}

        {!isPending && !isError ? (
          <>
            <Surface level={1} radius="lg">
              {BODY_METRIC_TYPES.map((metric) => {
                const latest = latestByMetric.get(metric);
                const unit = displayUnitLabel(metric, weightUnit ?? 'kg', lengthUnit ?? 'cm');
                const subtitle = latest
                  ? t('bodyMetrics.list.lastLoggedTemplate', {
                      date: formatBodyMetricsDate(latest.measuredAt),
                    })
                  : t('bodyMetrics.list.noEntryLabel');

                return (
                  <ListRow
                    key={metric}
                    title={metricLabel(metric)}
                    subtitle={subtitle}
                    leading={
                      <Ionicons
                        name={metricIconName(metric)}
                        size={22}
                        color={color.textSecondary}
                      />
                    }
                    trailing={
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                        {latest ? (
                          <Text variant="numeric" color="primary">
                            {formatDisplayValue(
                              metric,
                              latest.value,
                              weightUnit ?? 'kg',
                              lengthUnit ?? 'cm',
                            )}{' '}
                            {unit}
                          </Text>
                        ) : null}
                        <IconButton
                          icon={<Ionicons name="add" size={18} color={color.accent} />}
                          variant="ghost"
                          size="sm"
                          accessibilityLabel={t('bodyMetrics.list.addAccessibilityLabelTemplate', {
                            metric: metricLabel(metric),
                          })}
                          onPress={() => openQuickEntry(metric)}
                          testID={`body-metrics-quick-add-${metric}`}
                        />
                      </View>
                    }
                    onPress={() => router.push(routes.bodyMetrics.history(metric))}
                    showChevron
                    testID={`body-metrics-row-${metric}`}
                  />
                );
              })}
            </Surface>

            <Surface level={1} radius="lg">
              <ListRow
                title={t('bodyMetrics.list.photosRowTitle')}
                subtitle={t('bodyMetrics.list.photosRowSubtitle')}
                leading={<Ionicons name="camera-outline" size={22} color={color.textSecondary} />}
                onPress={() => router.push(routes.bodyMetrics.photos())}
                showChevron
                testID="body-metrics-photos-row"
              />
            </Surface>
          </>
        ) : null}
      </Column>
    </Screen>
  );
}
