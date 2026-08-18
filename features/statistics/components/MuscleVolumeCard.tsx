import { Ionicons } from '@expo/vector-icons';

import { ChartCard, StackedBarChartView, type CategorySlice } from '@/components/charts';
import { t, type TranslationKey } from '@/i18n';
import { color } from '@/theme/tokens';

import type { MuscleVolumeSlice } from '../repository/StatisticsRepository';

export interface MuscleVolumeCardProps {
  data: readonly MuscleVolumeSlice[] | undefined;
  isPending: boolean;
  testID?: string | undefined;
}

const BODY_PART_LABEL_KEY: Record<string, TranslationKey> = {
  upper: 'statistics.bodyPart.upper',
  lower: 'statistics.bodyPart.lower',
  core: 'statistics.bodyPart.core',
  arms: 'statistics.bodyPart.arms',
  back: 'statistics.bodyPart.back',
  shoulders: 'statistics.bodyPart.shoulders',
  legs: 'statistics.bodyPart.legs',
  other: 'statistics.bodyPart.other',
};

function bodyPartLabel(bodyPart: string): string {
  const key = BODY_PART_LABEL_KEY[bodyPart];
  return key ? t(key) : bodyPart;
}

/** `statistics` feature component - "muscle-group volume breakdown," roadmap P11 (Step 0 decision 2: coarse `body_part`, primary muscle only). */
export function MuscleVolumeCard({ data, isPending, testID }: MuscleVolumeCardProps) {
  const slices: CategorySlice[] = (data ?? []).map((slice, index) => ({
    label: bodyPartLabel(slice.bodyPart),
    value: slice.volumeKg,
    color: color.chart[index % color.chart.length]!,
  }));
  const isEmpty = slices.length === 0;

  return (
    <ChartCard
      title={t('statistics.muscleVolume.title')}
      subtitle={t('statistics.muscleVolume.subtitle')}
      isPending={isPending}
      isEmpty={isEmpty}
      emptyIcon={<Ionicons name="body-outline" size={32} color={color.textTertiary} />}
      emptyTitle={t('statistics.muscleVolume.emptyTitle')}
      emptyMessage={t('statistics.muscleVolume.emptyMessage')}
      testID={testID}
    >
      <StackedBarChartView slices={slices} formatValue={(value) => `${Math.round(value)} kg`} />
    </ChartCard>
  );
}
