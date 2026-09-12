import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { Column, Screen } from '@/components/layout';
import { Skeleton } from '@/components/feedback';
import { Button, StepperField, Surface, Text, TextField } from '@/components/ui';
import { t } from '@/i18n';
import { space } from '@/theme/tokens';

import { usePlateCalculatorSettings } from '../hooks/useSettings';

const BAR_WEIGHT_STEP_KG = 0.5;
const BAR_WEIGHT_MIN_KG = 1;
const BAR_WEIGHT_MAX_KG = 50;

/**
 * `app/profile/settings/plates.tsx`'s screen body - the Gravitus-inspired
 * refresh's plate calculator inputs (bar weight, EZ-bar weight, available
 * plate sizes). Lives under `profile` (not `workout-logging`, which owns the
 * plate-math domain calculator and the in-workout sheet) for the same reason
 * `ProgressionSettingsScreen` lives here despite `oneRm.formula`/
 * `progression.*` conceptually belonging to `records`: `usePlateCalculatorSettings`
 * (`../hooks/useSettings.ts`) isn't barrel-exported, and `workout-logging`
 * reaching past `@/features/profile` into its internals would violate the
 * cross-feature-imports-through-a-barrel rule (`eslint.config.js`'s
 * `crossFeatureBarrelZones`) - `PlateCalculatorSheetContent` (`workout-logging`)
 * reads the same three settings keys directly off `settings` instead, for
 * exactly this reason.
 *
 * Structurally mirrors `ProgressionSettingsScreen`'s shape (a local-state
 * "Controls" sub-component seeded from the settled query, each field
 * committing on its own change) rather than `TimerSettingsScreen`'s -
 * `TimerSettingsScreen`'s own fields commit through fixed preset chips with
 * nothing to parse, which doesn't fit `availablePlatesKg`'s free-text list.
 */
export function PlateCalculatorSettingsScreen() {
  const {
    barWeightKg,
    ezBarWeightKg,
    availablePlatesKg,
    isPending,
    setBarWeightKg,
    setEzBarWeightKg,
    setAvailablePlatesKg,
  } = usePlateCalculatorSettings();

  const showSkeleton =
    isPending ||
    barWeightKg === undefined ||
    ezBarWeightKg === undefined ||
    availablePlatesKg === undefined;

  useEffect(() => {
    if (showSkeleton) {
      AccessibilityInfo.announceForAccessibility(t('common.loading'));
    }
  }, [showSkeleton]);

  return (
    <Screen scroll edges={['bottom']} testID="plate-calculator-settings-screen">
      <Column gap={6} style={{ paddingVertical: space[6] }}>
        {showSkeleton ? (
          <PlateCalculatorSettingsSkeleton />
        ) : (
          <PlateCalculatorControls
            initialBarWeightKg={barWeightKg}
            initialEzBarWeightKg={ezBarWeightKg}
            initialAvailablePlatesKg={availablePlatesKg}
            onBarWeightChange={setBarWeightKg}
            onEzBarWeightChange={setEzBarWeightKg}
            onAvailablePlatesChange={setAvailablePlatesKg}
          />
        )}
      </Column>
    </Screen>
  );
}

/** Parses a comma/space-separated list of positive numbers, dropping anything that doesn't parse - the same "silently skip what's invalid rather than block the whole save" leniency a free-text list needs. Returns `null` when nothing valid remains, so the caller can refuse an empty save instead of persisting `[]`. */
function parsePlateList(text: string): number[] | null {
  const values = text
    .split(/[,\s]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => Number(token))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (values.length === 0) {
    return null;
  }
  return [...new Set(values)].sort((a, b) => b - a);
}

function formatPlateList(platesKg: readonly number[]): string {
  return platesKg.join(', ');
}

function PlateCalculatorControls({
  initialBarWeightKg,
  initialEzBarWeightKg,
  initialAvailablePlatesKg,
  onBarWeightChange,
  onEzBarWeightChange,
  onAvailablePlatesChange,
}: {
  initialBarWeightKg: number;
  initialEzBarWeightKg: number;
  initialAvailablePlatesKg: readonly number[];
  onBarWeightChange: (value: number) => void;
  onEzBarWeightChange: (value: number) => void;
  onAvailablePlatesChange: (value: number[]) => void;
}) {
  const [barWeightKg, setBarWeightKg] = useState(initialBarWeightKg);
  const [ezBarWeightKg, setEzBarWeightKg] = useState(initialEzBarWeightKg);
  const [platesText, setPlatesText] = useState(() => formatPlateList(initialAvailablePlatesKg));
  const [platesError, setPlatesError] = useState<string | null>(null);

  function handleBarWeightChange(value: number | null) {
    const next = value ?? BAR_WEIGHT_MIN_KG;
    setBarWeightKg(next);
    onBarWeightChange(next);
  }

  function handleEzBarWeightChange(value: number | null) {
    const next = value ?? BAR_WEIGHT_MIN_KG;
    setEzBarWeightKg(next);
    onEzBarWeightChange(next);
  }

  function handleSavePlates() {
    const parsed = parsePlateList(platesText);
    if (!parsed) {
      setPlatesError(t('profileSettings.plateCalculator.platesInvalidMessage'));
      return;
    }
    setPlatesError(null);
    setPlatesText(formatPlateList(parsed));
    onAvailablePlatesChange(parsed);
  }

  return (
    <>
      <Column gap={4}>
        <Text variant="label" color="secondary">
          {t('profileSettings.plateCalculator.barsSectionTitle')}
        </Text>
        <Surface level={1} radius="lg" padding={4}>
          <Column gap={4}>
            <Column gap={2}>
              <Text variant="body" color="primary">
                {t('profileSettings.plateCalculator.standardBarLabel')}
              </Text>
              <StepperField
                value={barWeightKg}
                onChange={handleBarWeightChange}
                step={BAR_WEIGHT_STEP_KG}
                min={BAR_WEIGHT_MIN_KG}
                max={BAR_WEIGHT_MAX_KG}
                precision={1}
                unitSuffix={t('workoutLogging.set.weightUnitSuffix')}
                accessibilityLabel={t('profileSettings.plateCalculator.standardBarLabel')}
                testID="plate-calculator-settings-bar-weight"
              />
            </Column>
            <Column gap={2}>
              <Text variant="body" color="primary">
                {t('profileSettings.plateCalculator.ezBarLabel')}
              </Text>
              <StepperField
                value={ezBarWeightKg}
                onChange={handleEzBarWeightChange}
                step={BAR_WEIGHT_STEP_KG}
                min={BAR_WEIGHT_MIN_KG}
                max={BAR_WEIGHT_MAX_KG}
                precision={1}
                unitSuffix={t('workoutLogging.set.weightUnitSuffix')}
                accessibilityLabel={t('profileSettings.plateCalculator.ezBarLabel')}
                testID="plate-calculator-settings-ez-bar-weight"
              />
            </Column>
          </Column>
        </Surface>
      </Column>

      <Column gap={2}>
        <Text variant="label" color="secondary">
          {t('profileSettings.plateCalculator.platesSectionTitle')}
        </Text>
        <TextField
          value={platesText}
          onChangeText={setPlatesText}
          keyboardType="numbers-and-punctuation"
          placeholder="25, 20, 15, 10, 5, 2.5, 1.25"
          error={platesError ?? undefined}
          helper={
            platesError ? undefined : t('profileSettings.plateCalculator.platesHelperMessage')
          }
          testID="plate-calculator-settings-plates-field"
        />
        <Button
          variant="secondary"
          size="sm"
          label={t('common.save')}
          onPress={handleSavePlates}
          testID="plate-calculator-settings-plates-save"
        />
      </Column>
    </>
  );
}

function PlateCalculatorSettingsSkeleton() {
  return (
    <Column gap={4}>
      <Skeleton width="40%" height={16} />
      <Skeleton width="100%" height={120} radius="lg" />
      <Skeleton width="100%" height={80} radius="lg" />
    </Column>
  );
}
