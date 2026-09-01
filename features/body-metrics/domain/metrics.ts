/**
 * Body metric type list and unit mapping - the single source of truth both
 * `BodyMetricService`'s Zod schema and (in a later frontend-agent pass) the
 * presentation layer's display/unit-conversion logic read from. Mirrors
 * `database/schema.sql`'s `body_metric_entry.metric` CHECK constraint
 * verbatim - do not let this list drift from that constraint.
 *
 * Domain-pure: no React/React Native/Expo import (ARCHITECTURE.md section 3.1
 * rule 1, `gymtracker/domain-purity`).
 */
export const BODY_METRIC_TYPES = [
  'body_weight',
  'body_fat_pct',
  'chest',
  'waist',
  'hips',
  'neck',
  'shoulders',
  'arm_left',
  'arm_right',
  'forearm_left',
  'forearm_right',
  'thigh_left',
  'thigh_right',
  'calf_left',
  'calf_right',
] as const;

export type BodyMetricType = (typeof BODY_METRIC_TYPES)[number];

export type MetricUnit = 'kg' | 'percent' | 'cm';

/**
 * `body_weight` -> `'kg'`, `body_fat_pct` -> `'percent'`, every other metric
 * (a circumference measurement) -> `'cm'` - matches `body_metric_entry.value`'s
 * own column comment in `database/schema.sql`.
 */
export function metricUnit(metric: BodyMetricType): MetricUnit {
  if (metric === 'body_weight') {
    return 'kg';
  }
  if (metric === 'body_fat_pct') {
    return 'percent';
  }
  return 'cm';
}
