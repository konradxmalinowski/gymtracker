import { useLocalSearchParams } from 'expo-router';

import { BODY_METRIC_TYPES, type BodyMetricType } from '@/features/body-metrics';
import { MetricHistoryScreen } from '@/features/body-metrics/screens/MetricHistoryScreen';

function isBodyMetricType(value: string | undefined): value is BodyMetricType {
  return value !== undefined && (BODY_METRIC_TYPES as readonly string[]).includes(value);
}

export default function BodyMetricDetail() {
  const { metric } = useLocalSearchParams<{ metric: string }>();
  return <MetricHistoryScreen metric={isBodyMetricType(metric) ? metric : undefined} />;
}
