import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { EntityId } from '@/repositories/contracts/repository';
import { useContainer } from '@/services/container';

import type { Pagination } from '@/repositories/query';
import type { BodyMetricType } from '../domain/metrics';
import { invalidateBodyMetricQueries } from './invalidation';
import { toCanonicalValue } from './metricUnits';
import { bodyMetricKeys } from './queryKeys';
import { useDisplayUnits } from './useDisplayUnits';

/**
 * `LatestMetricValue[]` - one row per metric with at least one non-deleted
 * entry (`BodyMetricRepository.listLatestPerMetric`'s own contract - a
 * metric with zero entries is simply absent from this list). Screens must
 * merge this against the full `BODY_METRIC_TYPES` list themselves to render
 * a real per-metric empty state rather than omitting untouched metrics
 * entirely (CLAUDE.md's "real empty state, not omission" rule).
 */
export function useLatestMetricValues() {
  const { bodyMetricService } = useContainer();

  return useQuery({
    queryKey: bodyMetricKeys.latest,
    queryFn: () => bodyMetricService.listLatestValues(),
  });
}

/**
 * A single metric's full entry history, newest first - unbounded (see
 * `BodyMetricRepository.listByMetric`'s own doc comment: a single metric's
 * history stays small). `metric` may be `undefined` while a route param is
 * still resolving - `enabled: false` in that case, the same guard
 * `usePlan`/`useSessionDetail` already use for the identical situation.
 */
export function useMetricHistory(
  metric: BodyMetricType | undefined,
  options?: Partial<Pagination>,
) {
  const { bodyMetricService } = useContainer();

  return useQuery({
    queryKey: bodyMetricKeys.history(metric ?? 'body_weight'),
    queryFn: () => bodyMetricService.listHistory(metric as BodyMetricType, options),
    enabled: Boolean(metric),
  });
}

export interface RecordMetricEntryVariables {
  metric: BodyMetricType;
  /** In the user's *current* display unit (`units.weight`/`units.length`) - converted to canonical before reaching the service. */
  displayValue: number;
  note?: string | null;
  measuredAt?: number;
}

/**
 * Wraps `BodyMetricService.recordEntry`, taking display-unit input and
 * converting to the metric's canonical unit via `metricUnits.ts` before the
 * value ever reaches the service - the one place in this feature the
 * unit-conversion boundary matters (`BodyMetricService.recordEntry`'s own
 * doc comment: it does not, and must not, convert). `useUnitsSettings()`'s
 * `weightUnit`/`lengthUnit` may still be `undefined` on a cold query cache;
 * falling back to the metric's own canonical unit (`'kg'`/`'cm'`) in that
 * case is a safe no-op conversion, not a silent unit-mismatch bug, since the
 * canonical unit is always a valid *display* unit too.
 *
 * @throws {BodyMetricValidationError} when the converted `value` is
 * non-finite/zero/negative, or `note` exceeds `BODY_METRIC_NOTE_MAX_LENGTH`.
 */
export function useRecordMetricEntry() {
  const { bodyMetricService } = useContainer();
  const queryClient = useQueryClient();
  const { weightUnit, lengthUnit } = useDisplayUnits();

  return useMutation({
    mutationFn: (variables: RecordMetricEntryVariables) => {
      const value = toCanonicalValue(
        variables.metric,
        variables.displayValue,
        weightUnit ?? 'kg',
        lengthUnit ?? 'cm',
      );
      // Built incrementally rather than a single object literal with
      // `note: variables.note`/`measuredAt: variables.measuredAt` -
      // `exactOptionalPropertyTypes` forbids assigning an explicit
      // `undefined` to an optional property, the same mismatch
      // `ProgressPhotoService.addPhoto`'s own doc comment describes for its
      // `createInput` construction.
      const input: Parameters<typeof bodyMetricService.recordEntry>[0] = {
        metric: variables.metric,
        value,
      };
      if (variables.note !== undefined) {
        input.note = variables.note;
      }
      if (variables.measuredAt !== undefined) {
        input.measuredAt = variables.measuredAt;
      }
      return bodyMetricService.recordEntry(input);
    },
    onSuccess: (_data, variables) => invalidateBodyMetricQueries(queryClient, variables.metric),
  });
}

export interface UpdateMetricEntryVariables {
  id: EntityId;
  metric: BodyMetricType;
  displayValue?: number;
  note?: string | null;
  measuredAt?: number;
}

/** Same canonical-unit conversion as {@link useRecordMetricEntry}. */
export function useUpdateMetricEntry() {
  const { bodyMetricService } = useContainer();
  const queryClient = useQueryClient();
  const { weightUnit, lengthUnit } = useDisplayUnits();

  return useMutation({
    mutationFn: ({ id, metric, displayValue, note, measuredAt }: UpdateMetricEntryVariables) => {
      const patch: { value?: number; note?: string | null; measuredAt?: number } = {};
      if (displayValue !== undefined) {
        patch.value = toCanonicalValue(
          metric,
          displayValue,
          weightUnit ?? 'kg',
          lengthUnit ?? 'cm',
        );
      }
      if (note !== undefined) {
        patch.note = note;
      }
      if (measuredAt !== undefined) {
        patch.measuredAt = measuredAt;
      }
      return bodyMetricService.updateEntry(id, patch);
    },
    onSuccess: (_data, variables) => invalidateBodyMetricQueries(queryClient, variables.metric),
  });
}

/** Soft delete - feeds the per-entry undo toast (call site owns the `ToastHost` interaction, mirroring `PlanDetailScreen.handleDeleteDay`). Pairs with {@link useRestoreMetricEntry}. */
export function useDeleteMetricEntry() {
  const { bodyMetricService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: EntityId; metric: BodyMetricType }) =>
      bodyMetricService.deleteEntry(id),
    onSuccess: (_data, variables) => invalidateBodyMetricQueries(queryClient, variables.metric),
  });
}

/** Undoes {@link useDeleteMetricEntry}. */
export function useRestoreMetricEntry() {
  const { bodyMetricService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: EntityId; metric: BodyMetricType }) =>
      bodyMetricService.restoreEntry(id),
    onSuccess: (_data, variables) => invalidateBodyMetricQueries(queryClient, variables.metric),
  });
}
