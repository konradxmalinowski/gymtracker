/**
 * Public barrel for the "statistics" feature (ARCHITECTURE.md section 3.1,
 * rule 4). `exercise-library` cannot import from here (it stays a
 * dependency-free leaf); `app/(tabs)/exercises/[id].tsx` fills
 * `ExerciseDetailScreen`'s `progressChartSlot` through this barrel instead,
 * the same "app/ composes feature barrels" pattern P8 established for
 * `previousPerformanceSlot`/`personalRecordsSlot`.
 *
 * Screens are never barrel-exported in this codebase (confirmed against
 * every existing feature) - `StatisticsScreen`/`ExerciseProgressionScreen`
 * are imported by their `app/` route wrapper via direct file path.
 */

export type { StatRange, BucketGranularity } from './domain/statRange';
export { STAT_RANGES, RANGE_BUCKET, resolveStatRange } from './domain/statRange';
export type {
  ProgressionMetric,
  SeriesPoint as ProgressionSeriesPoint,
} from './domain/exerciseProgressionReducer';

export type {
  StatisticsRepository,
  TimeBucket,
  MuscleVolumeSlice,
  DayIntensity,
  HeatmapLevel,
} from './repository/StatisticsRepository';

export { statisticsKeys, useStatisticsDashboard } from './hooks/useStatisticsDashboard';
export type { StatisticsDashboardData } from './hooks/useStatisticsDashboard';
export { useExerciseProgression } from './hooks/useExerciseProgression';

export { ExerciseProgressionCard } from './components/ExerciseProgressionCard';
export type { ExerciseProgressionCardProps } from './components/ExerciseProgressionCard';
export { StatRangeSelector } from './components/StatRangeSelector';
export type { StatRangeSelectorProps } from './components/StatRangeSelector';
