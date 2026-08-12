import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { Column, Screen } from '@/components/layout';
import { SegmentedControl, StepperField, Surface, Text } from '@/components/ui';
import { Skeleton } from '@/components/feedback';
import {
  useOneRmFormulaSetting,
  useProgressionIncrementSettings,
} from '@/features/profile/hooks/useSettings';
import { t } from '@/i18n';
import { space } from '@/theme/tokens';

type OneRmFormula = 'epley' | 'brzycki';

const INCREMENT_STEP_KG = 0.5;
const INCREMENT_MIN_KG = 0.5;
const INCREMENT_MAX_KG = 50;

/**
 * `app/profile/settings/progression.tsx`'s screen body - ADR-0015 Decisions
 * 1/2's user-facing settings (`oneRm.formula`,
 * `progression.upperIncrementKg`/`lowerIncrementKg`). Structurally mirrors
 * `UnitsSettingsScreen.tsx`: this branch predates P7's rest-timer
 * implementation (`app/profile/settings/timers.tsx` doesn't exist here yet),
 * so `UnitsSettingsScreen` is the real precedent on disk for "a settings
 * screen with a segmented control plus a preview/detail block", not P7's
 * screen.
 */
export function ProgressionSettingsScreen() {
  const { formula, isPending: formulaPending, setFormula } = useOneRmFormulaSetting();
  const {
    upperIncrementKg,
    lowerIncrementKg,
    isPending: incrementsPending,
    setUpperIncrementKg,
    setLowerIncrementKg,
  } = useProgressionIncrementSettings();

  const showSkeleton =
    formulaPending ||
    incrementsPending ||
    !formula ||
    upperIncrementKg === undefined ||
    lowerIncrementKg === undefined;

  useEffect(() => {
    if (showSkeleton) {
      AccessibilityInfo.announceForAccessibility(t('common.loading'));
    }
  }, [showSkeleton]);

  return (
    <Screen scroll edges={['bottom']} testID="progression-settings-screen">
      <Column gap={8} style={{ paddingVertical: space[6] }}>
        {showSkeleton ? (
          <ProgressionSkeleton />
        ) : (
          <ProgressionControls
            initialFormula={formula}
            initialUpperIncrementKg={upperIncrementKg}
            initialLowerIncrementKg={lowerIncrementKg}
            onFormulaChange={setFormula}
            onUpperIncrementChange={setUpperIncrementKg}
            onLowerIncrementChange={setLowerIncrementKg}
          />
        )}
      </Column>
    </Screen>
  );
}

function ProgressionControls({
  initialFormula,
  initialUpperIncrementKg,
  initialLowerIncrementKg,
  onFormulaChange,
  onUpperIncrementChange,
  onLowerIncrementChange,
}: {
  initialFormula: OneRmFormula;
  initialUpperIncrementKg: number;
  initialLowerIncrementKg: number;
  onFormulaChange: (value: OneRmFormula) => void;
  onUpperIncrementChange: (value: number) => void;
  onLowerIncrementChange: (value: number) => void;
}) {
  const [formula, setFormula] = useState<OneRmFormula>(initialFormula);
  const [upperIncrementKg, setUpperIncrementKg] = useState<number>(initialUpperIncrementKg);
  const [lowerIncrementKg, setLowerIncrementKg] = useState<number>(initialLowerIncrementKg);

  const handleFormulaChange = (value: OneRmFormula) => {
    setFormula(value);
    onFormulaChange(value);
  };

  const handleUpperChange = (value: number | null) => {
    const next = value ?? INCREMENT_MIN_KG;
    setUpperIncrementKg(next);
    onUpperIncrementChange(next);
  };

  const handleLowerChange = (value: number | null) => {
    const next = value ?? INCREMENT_MIN_KG;
    setLowerIncrementKg(next);
    onLowerIncrementChange(next);
  };

  return (
    <>
      <Column gap={2}>
        <Text variant="label" color="secondary">
          {t('progressionSettings.formulaSectionTitle')}
        </Text>
        <SegmentedControl
          options={[
            { value: 'epley' as const, label: t('progressionSettings.formulaEpley') },
            { value: 'brzycki' as const, label: t('progressionSettings.formulaBrzycki') },
          ]}
          value={formula}
          onChange={handleFormulaChange}
          testID="progression-formula-segmented-control"
        />
      </Column>

      <Column gap={4}>
        <Text variant="label" color="secondary">
          {t('progressionSettings.incrementsSectionTitle')}
        </Text>
        <Surface level={1} radius="lg" padding={4}>
          <Column gap={4}>
            <Column gap={2}>
              <Text variant="body" color="primary">
                {t('progressionSettings.upperIncrementLabel')}
              </Text>
              <StepperField
                value={upperIncrementKg}
                onChange={handleUpperChange}
                step={INCREMENT_STEP_KG}
                min={INCREMENT_MIN_KG}
                max={INCREMENT_MAX_KG}
                precision={1}
                unitSuffix={t('progressionSettings.incrementUnitSuffix')}
                accessibilityLabel={t('progressionSettings.upperIncrementAccessibilityLabel')}
                testID="progression-upper-increment-field"
              />
            </Column>
            <Column gap={2}>
              <Text variant="body" color="primary">
                {t('progressionSettings.lowerIncrementLabel')}
              </Text>
              <StepperField
                value={lowerIncrementKg}
                onChange={handleLowerChange}
                step={INCREMENT_STEP_KG}
                min={INCREMENT_MIN_KG}
                max={INCREMENT_MAX_KG}
                precision={1}
                unitSuffix={t('progressionSettings.incrementUnitSuffix')}
                accessibilityLabel={t('progressionSettings.lowerIncrementAccessibilityLabel')}
                testID="progression-lower-increment-field"
              />
            </Column>
          </Column>
        </Surface>
      </Column>
    </>
  );
}

function ProgressionSkeleton() {
  return (
    <Column gap={4}>
      <Skeleton width="50%" height={16} />
      <Skeleton width="100%" height={40} radius="md" />
      <Skeleton width="50%" height={16} />
      <Skeleton width="100%" height={120} radius="lg" />
    </Column>
  );
}
