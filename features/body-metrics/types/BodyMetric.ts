import type { EntityId } from '@/repositories/contracts/repository';
import type { BodyMetricType } from '../domain/metrics';

/**
 * One `body_metric_entry` row, camelCase - the "narrow" schema's single
 * reading (one metric, one value, one timestamp), never a wide multi-metric
 * row. `value` is always in the metric's own canonical unit
 * (`metricUnit(metric)`) - see `BodyMetricService.recordEntry`'s doc comment
 * for why unit conversion never happens at this layer.
 */
export interface BodyMetricEntry {
  id: EntityId;
  metric: BodyMetricType;
  value: number;
  measuredAt: number;
  localDate: string;
  note: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

/**
 * One row per metric that has at least one non-deleted entry - the "latest
 * value per metric" list screen's read model
 * (`BodyMetricRepository.listLatestPerMetric`), produced by a single
 * window-function SQL query, not a load-all-then-reduce-in-JS pass
 * (ARCHITECTURE.md section 3.1's CQRS-lite rule).
 */
export interface LatestMetricValue {
  metric: BodyMetricType;
  value: number;
  measuredAt: number;
  entryId: EntityId;
}
