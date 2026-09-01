/**
 * Display-unit conversion for body metrics - the one place in this feature's
 * presentation layer ADR-0009's "unit conversion for display only happens in
 * the presentation layer" rule applies. `BodyMetricService` (see its own
 * `recordEntry`/`updateEntry` doc comments) always stores/returns a value in
 * the metric's own canonical unit (`metricUnit()` - kg, percent, or cm); the
 * user's `units.weight`/`units.length` preference only ever affects what's
 * typed into or rendered by the quick-entry sheet, the history list, and the
 * chart.
 *
 * Not placed under `domain/` (off-limits for this pass - the backend half
 * already shipped it) even though it's pure, dependency-free logic; it lives
 * here in `hooks/` since every caller is a hook or a hook-adjacent
 * presentation helper, the same "unit-conversion boundary" role
 * `domain/Weight.ts`/`domain/Length.ts` play at the app root, just scoped to
 * this feature's own metric-type dispatch.
 */
import { Length } from '@/domain/Length';
import { Weight } from '@/domain/Weight';

import { metricUnit, type BodyMetricType } from '../domain/metrics';

export type WeightUnit = 'kg' | 'lb';
export type LengthUnit = 'cm' | 'in';

/** The unit label a metric's value renders with, given the user's current preference. */
export function displayUnitLabel(
  metric: BodyMetricType,
  weightUnit: WeightUnit,
  lengthUnit: LengthUnit,
): string {
  const unit = metricUnit(metric);
  if (unit === 'kg') {
    return weightUnit;
  }
  if (unit === 'cm') {
    return lengthUnit;
  }
  return '%';
}

/** Converts a canonical-unit value (as stored/returned by `BodyMetricService`) into the user's preferred display unit. */
export function toDisplayValue(
  metric: BodyMetricType,
  canonicalValue: number,
  weightUnit: WeightUnit,
  lengthUnit: LengthUnit,
): number {
  const unit = metricUnit(metric);
  if (unit === 'kg') {
    return weightUnit === 'kg' ? canonicalValue : Weight.fromKilograms(canonicalValue).toPounds();
  }
  if (unit === 'cm') {
    return lengthUnit === 'cm' ? canonicalValue : Length.fromCentimeters(canonicalValue).toInches();
  }
  return canonicalValue;
}

/** Converts a value typed in the user's preferred display unit back into the metric's canonical unit, ready for `BodyMetricService.recordEntry`/`updateEntry`. */
export function toCanonicalValue(
  metric: BodyMetricType,
  displayValue: number,
  weightUnit: WeightUnit,
  lengthUnit: LengthUnit,
): number {
  const unit = metricUnit(metric);
  if (unit === 'kg') {
    return weightUnit === 'kg' ? displayValue : Weight.fromPounds(displayValue).toKilograms();
  }
  if (unit === 'cm') {
    return lengthUnit === 'cm' ? displayValue : Length.fromInches(displayValue).toCentimeters();
  }
  return displayValue;
}

/**
 * Formats a canonical-unit value for display, routed through
 * `Weight.toDisplayString()`/`Length.toDisplayString()` for `kg`/`cm`
 * metrics - the same ADR-0009 rounding (nearest 0.25 kg/0.5 lb for weight,
 * always 1 decimal for length) every other weight/length display in this
 * app already uses, rather than a second, independently-rounded
 * `toFixed(1)` living only here. `body_fat_pct` has no `Weight`/`Length`
 * representation (it's already a percent, never converted) - formatted with
 * a plain 1-decimal `toFixed`, matching this app's other percent displays.
 */
export function formatDisplayValue(
  metric: BodyMetricType,
  canonicalValue: number,
  weightUnit: WeightUnit,
  lengthUnit: LengthUnit,
): string {
  const unit = metricUnit(metric);
  if (unit === 'kg') {
    return Weight.fromKilograms(canonicalValue).toDisplayString(weightUnit);
  }
  if (unit === 'cm') {
    return Length.fromCentimeters(canonicalValue).toDisplayString(lengthUnit);
  }
  return canonicalValue.toFixed(1);
}
