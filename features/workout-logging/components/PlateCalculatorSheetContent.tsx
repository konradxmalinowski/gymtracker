import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Column, Row } from '@/components/layout';
import { Skeleton } from '@/components/feedback';
import { Divider, NumberField, SegmentedControl, Text } from '@/components/ui';
import { t } from '@/i18n';
import { useContainer } from '@/services/container';
import { space } from '@/theme/tokens';

import { calculatePlateBreakdown } from '../domain/PlateCalculator';

export interface PlateCalculatorSheetContentProps {
  /** The currently-focused set's weight (`ActiveWorkoutScreen`'s `focusedSetId`), or `null` when nothing is focused - the target field starts empty in that case rather than guessing a value. */
  initialTargetWeightKg: number | null;
}

type BarType = 'standard' | 'ez';

const FALLBACK_STANDARD_BAR_WEIGHT_KG = 20;
const FALLBACK_EZ_BAR_WEIGHT_KG = 10;
const FALLBACK_AVAILABLE_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];

/**
 * Gravitus-inspired refresh: "how do I load the bar" for the currently
 * focused set. Rendered inside the app-root `SheetHost`/`BottomSheet`
 * (`present()`d from `SessionExerciseCard`'s "Plates" toolbar button) - the
 * same `sheetStore.present()` mechanism every sheet in this app now uses
 * (CLAUDE.md's "Post-P12 bugfix pass": an inline `<BottomSheet>` rendered
 * from a tab screen gets covered by `ActiveWorkoutBanner` when a workout is
 * minimized, which is exactly the surface this sheet is reached from).
 *
 * Reads `plateCalculator.*` settings directly off `settings` via its own
 * `useQuery` calls rather than `usePlateCalculatorSettings`
 * (`features/profile/hooks/useSettings.ts`): that hook isn't barrel-exported
 * from `profile`, and `workout-logging` reaching past `@/features/profile`
 * into its internals would violate the cross-feature-imports-through-a-barrel
 * rule (`eslint.config.js`'s `crossFeatureBarrelZones`) - the same reasoning
 * `useProgressionSuggestion`/`ExerciseProgressionScreen` already apply for
 * `progression.*`/`oneRm.formula` elsewhere in this codebase.
 */
export function PlateCalculatorSheetContent({
  initialTargetWeightKg,
}: PlateCalculatorSheetContentProps) {
  const { settings } = useContainer();
  const [barType, setBarType] = useState<BarType>('standard');
  const [targetWeightKg, setTargetWeightKg] = useState<number | null>(initialTargetWeightKg);

  const barWeightQuery = useQuery({
    queryKey: ['settings', 'plateCalculator.barWeightKg'],
    queryFn: () => settings.get('plateCalculator.barWeightKg'),
  });
  const ezBarWeightQuery = useQuery({
    queryKey: ['settings', 'plateCalculator.ezBarWeightKg'],
    queryFn: () => settings.get('plateCalculator.ezBarWeightKg'),
  });
  const availablePlatesQuery = useQuery({
    queryKey: ['settings', 'plateCalculator.availablePlatesKg'],
    queryFn: () => settings.get('plateCalculator.availablePlatesKg'),
  });

  const isPending =
    barWeightQuery.isPending || ezBarWeightQuery.isPending || availablePlatesQuery.isPending;

  const barWeightKg =
    barType === 'ez'
      ? (ezBarWeightQuery.data ?? FALLBACK_EZ_BAR_WEIGHT_KG)
      : (barWeightQuery.data ?? FALLBACK_STANDARD_BAR_WEIGHT_KG);
  const availablePlatesKg = availablePlatesQuery.data ?? FALLBACK_AVAILABLE_PLATES_KG;

  const result =
    targetWeightKg !== null && targetWeightKg > 0
      ? calculatePlateBreakdown({ targetWeightKg, barWeightKg, availablePlatesKg })
      : null;

  return (
    <Column gap={4} style={{ paddingTop: space[2], paddingBottom: space[4] }}>
      <Text variant="title3" color="primary">
        {t('workoutLogging.plateCalculator.title')}
      </Text>

      <SegmentedControl
        options={[
          { value: 'standard', label: t('workoutLogging.plateCalculator.standardBarLabel') },
          { value: 'ez', label: t('workoutLogging.plateCalculator.ezBarLabel') },
        ]}
        value={barType}
        onChange={setBarType}
        testID="plate-calculator-bar-type"
      />

      <NumberField
        value={targetWeightKg}
        onChange={setTargetWeightKg}
        precision={2}
        min={0}
        unitSuffix={t('workoutLogging.set.weightUnitSuffix')}
        accessibilityLabel={t('workoutLogging.plateCalculator.targetWeightAccessibilityLabel')}
        testID="plate-calculator-target-weight"
      />

      {isPending ? (
        <Column gap={2}>
          <Skeleton width="100%" height={20} />
          <Skeleton width="100%" height={20} />
        </Column>
      ) : result ? (
        <Column gap={2}>
          <Text variant="label" color="secondary">
            {t('workoutLogging.plateCalculator.perSideTitle')}
          </Text>
          {result.perSide.length === 0 ? (
            <Text variant="body" color="secondary">
              {t('workoutLogging.plateCalculator.noPlatesNeededMessage')}
            </Text>
          ) : (
            result.perSide.map((entry, index) => (
              <Column key={entry.plateWeightKg}>
                {index > 0 ? <Divider /> : null}
                <Row justify="space-between" style={{ paddingVertical: space[1] }}>
                  <Text variant="body" color="secondary">
                    {t('workoutLogging.plateCalculator.plateRowTemplate', {
                      weight: entry.plateWeightKg,
                    })}
                  </Text>
                  <Text variant="numeric" color="primary">
                    {t('workoutLogging.plateCalculator.plateCountTemplate', {
                      count: entry.count,
                    })}
                  </Text>
                </Row>
              </Column>
            ))
          )}

          <Divider />

          <Row justify="space-between">
            <Text variant="bodyMedium" color="primary">
              {t('workoutLogging.plateCalculator.achievedLabel')}
            </Text>
            <Text variant="numeric" color="primary" testID="plate-calculator-achieved-weight">
              {t('workoutLogging.plateCalculator.weightValueTemplate', {
                value: Math.round(result.achievedWeightKg * 100) / 100,
              })}
            </Text>
          </Row>

          {Math.abs(result.deltaKg) > 0.001 ? (
            <Text variant="footnote" color="tertiary">
              {t('workoutLogging.plateCalculator.deltaTemplate', {
                delta:
                  result.deltaKg > 0 ? `+${result.deltaKg.toFixed(2)}` : result.deltaKg.toFixed(2),
              })}
            </Text>
          ) : null}
        </Column>
      ) : (
        <Text variant="body" color="secondary">
          {t('workoutLogging.plateCalculator.enterWeightMessage')}
        </Text>
      )}
    </Column>
  );
}
