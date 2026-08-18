/**
 * The chart adapter's own data shapes (ADR-0010) - what every `components/
 * charts` component accepts, independent of any feature's DTOs. A feature
 * (today, only `statistics`) maps its own repository DTOs onto these at the
 * call site; `components/charts` never imports a feature type, keeping it a
 * true cross-feature, zero-domain-knowledge component per the folder rule.
 */

/** One point on a time-bucketed line/bar chart. `value: null` renders as a gap, never a zero. */
export interface SeriesPoint {
  x: string;
  value: number | null;
}

/** One category's share on a stacked/proportional bar (e.g. one muscle-group slice). */
export interface CategorySlice {
  label: string;
  value: number;
  color: string;
}
