import { t } from '@/i18n';

import type { BodyMetricType } from '../domain/metrics';
import type { PhotoPose } from '../types/ProgressPhoto';

/**
 * Every metric's display label, keyed through a fixed
 * `Record<BodyMetricType, TranslationKey>` map rather than a dynamically
 * built `bodyMetrics.metricLabel.${metric}` string - `t()`'s
 * `TranslationKey` type is a literal union derived from the catalog's own
 * shape (`i18n/translate.ts`), which a template-literal key cannot narrow
 * to. Mirrors `ExerciseProgressionCard.tsx`'s own `METRIC_LABEL_KEY` pattern.
 */
const METRIC_LABEL_KEY: Record<
  BodyMetricType,
  `bodyMetrics.metricLabel.${
    | 'bodyWeight'
    | 'bodyFatPct'
    | 'chest'
    | 'waist'
    | 'hips'
    | 'neck'
    | 'shoulders'
    | 'armLeft'
    | 'armRight'
    | 'forearmLeft'
    | 'forearmRight'
    | 'thighLeft'
    | 'thighRight'
    | 'calfLeft'
    | 'calfRight'}`
> = {
  body_weight: 'bodyMetrics.metricLabel.bodyWeight',
  body_fat_pct: 'bodyMetrics.metricLabel.bodyFatPct',
  chest: 'bodyMetrics.metricLabel.chest',
  waist: 'bodyMetrics.metricLabel.waist',
  hips: 'bodyMetrics.metricLabel.hips',
  neck: 'bodyMetrics.metricLabel.neck',
  shoulders: 'bodyMetrics.metricLabel.shoulders',
  arm_left: 'bodyMetrics.metricLabel.armLeft',
  arm_right: 'bodyMetrics.metricLabel.armRight',
  forearm_left: 'bodyMetrics.metricLabel.forearmLeft',
  forearm_right: 'bodyMetrics.metricLabel.forearmRight',
  thigh_left: 'bodyMetrics.metricLabel.thighLeft',
  thigh_right: 'bodyMetrics.metricLabel.thighRight',
  calf_left: 'bodyMetrics.metricLabel.calfLeft',
  calf_right: 'bodyMetrics.metricLabel.calfRight',
};

export function metricLabel(metric: BodyMetricType): string {
  return t(METRIC_LABEL_KEY[metric]);
}

/** `Ionicons` name per metric - `scale`/`pie-chart` for the two non-circumference metrics, `resize` (a two-way arrow) for every circumference measurement. */
const METRIC_ICON: Record<
  BodyMetricType,
  'scale-outline' | 'pie-chart-outline' | 'resize-outline'
> = {
  body_weight: 'scale-outline',
  body_fat_pct: 'pie-chart-outline',
  chest: 'resize-outline',
  waist: 'resize-outline',
  hips: 'resize-outline',
  neck: 'resize-outline',
  shoulders: 'resize-outline',
  arm_left: 'resize-outline',
  arm_right: 'resize-outline',
  forearm_left: 'resize-outline',
  forearm_right: 'resize-outline',
  thigh_left: 'resize-outline',
  thigh_right: 'resize-outline',
  calf_left: 'resize-outline',
  calf_right: 'resize-outline',
};

export function metricIconName(metric: BodyMetricType) {
  return METRIC_ICON[metric];
}

const POSE_LABEL_KEY: Record<
  PhotoPose,
  `bodyMetrics.photoDetail.pose.${'front' | 'side' | 'back' | 'other'}`
> = {
  front: 'bodyMetrics.photoDetail.pose.front',
  side: 'bodyMetrics.photoDetail.pose.side',
  back: 'bodyMetrics.photoDetail.pose.back',
  other: 'bodyMetrics.photoDetail.pose.other',
};

export function poseLabel(pose: PhotoPose): string {
  return t(POSE_LABEL_KEY[pose]);
}
