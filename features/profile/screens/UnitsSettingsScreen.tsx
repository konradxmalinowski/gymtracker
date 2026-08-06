import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { Column, Screen } from '@/components/layout';
import { SegmentedControl, Surface, Text } from '@/components/ui';
import { Skeleton } from '@/components/feedback';
import { Length } from '@/domain/Length';
import { Weight } from '@/domain/Weight';
import { useUnitsSettings } from '@/features/profile/hooks/useSettings';
import { t } from '@/i18n';
import { space } from '@/theme/tokens';

type WeightUnit = 'kg' | 'lb';
type LengthUnit = 'cm' | 'in';

// Arbitrary, fixed sample values purely to demonstrate the display format -
// never written anywhere, never derived from real user data.
const SAMPLE_WEIGHT_KG = 60;
const SAMPLE_LENGTH_CM = 180;

/**
 * `app/profile/settings/units.tsx`'s screen body. ADR-0009: switching a
 * segment is a pure display toggle, never a domain-data mutation.
 *
 * `UnitsControls` only mounts once both settings have loaded, so its local
 * state initializes directly from the resolved value with no
 * effect-driven sync (React's "you might not need an effect" - deriving
 * state from a prop via `useEffect` + `setState` causes an extra render and
 * trips the project's `react-hooks/set-state-in-effect` lint rule). After
 * that, local state is the instant, optimistic source of truth for what's
 * on screen; the SQLite write and its MMKV mirror happen in the background.
 */
export function UnitsSettingsScreen() {
  const { weightUnit, lengthUnit, isPending, setWeightUnit, setLengthUnit } = useUnitsSettings();
  const showSkeleton = isPending || !weightUnit || !lengthUnit;

  // Same pattern as ProfileScreen.tsx: `accessibilityLiveRegion` alone
  // wouldn't reach a VoiceOver user, and a screen reader user otherwise gets
  // silence during load, then the segmented controls appear with no warning.
  useEffect(() => {
    if (showSkeleton) {
      AccessibilityInfo.announceForAccessibility(t('common.loading'));
    }
  }, [showSkeleton]);

  return (
    <Screen scroll edges={['bottom']} testID="units-settings-screen">
      <Column gap={8} style={{ paddingVertical: space[6] }}>
        {showSkeleton ? (
          <UnitsSkeleton />
        ) : (
          <UnitsControls
            initialWeightUnit={weightUnit}
            initialLengthUnit={lengthUnit}
            onWeightUnitChange={setWeightUnit}
            onLengthUnitChange={setLengthUnit}
          />
        )}
      </Column>
    </Screen>
  );
}

function UnitsControls({
  initialWeightUnit,
  initialLengthUnit,
  onWeightUnitChange,
  onLengthUnitChange,
}: {
  initialWeightUnit: WeightUnit;
  initialLengthUnit: LengthUnit;
  onWeightUnitChange: (value: WeightUnit) => void;
  onLengthUnitChange: (value: LengthUnit) => void;
}) {
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(initialWeightUnit);
  const [lengthUnit, setLengthUnit] = useState<LengthUnit>(initialLengthUnit);

  const handleWeightChange = (value: WeightUnit) => {
    setWeightUnit(value);
    onWeightUnitChange(value);
  };

  const handleLengthChange = (value: LengthUnit) => {
    setLengthUnit(value);
    onLengthUnitChange(value);
  };

  const weightPreview = `${Weight.fromKilograms(SAMPLE_WEIGHT_KG).toDisplayString(weightUnit)} ${t(
    weightUnit === 'kg' ? 'unitsSettings.weightKg' : 'unitsSettings.weightLb',
  )}`;
  const lengthPreview = `${Length.fromCentimeters(SAMPLE_LENGTH_CM).toDisplayString(lengthUnit)} ${t(
    lengthUnit === 'cm' ? 'unitsSettings.lengthCm' : 'unitsSettings.lengthIn',
  )}`;

  return (
    <>
      <Column gap={2}>
        <Text variant="label" color="secondary">
          {t('unitsSettings.weightSectionTitle')}
        </Text>
        <SegmentedControl
          options={[
            { value: 'kg' as const, label: t('unitsSettings.weightKg') },
            { value: 'lb' as const, label: t('unitsSettings.weightLb') },
          ]}
          value={weightUnit}
          onChange={handleWeightChange}
          testID="units-weight-segmented-control"
        />
      </Column>

      <Column gap={2}>
        <Text variant="label" color="secondary">
          {t('unitsSettings.lengthSectionTitle')}
        </Text>
        <SegmentedControl
          options={[
            { value: 'cm' as const, label: t('unitsSettings.lengthCm') },
            { value: 'in' as const, label: t('unitsSettings.lengthIn') },
          ]}
          value={lengthUnit}
          onChange={handleLengthChange}
          testID="units-length-segmented-control"
        />
      </Column>

      <Surface level={1} radius="lg" padding={4}>
        <Column gap={2}>
          <Text variant="label" color="tertiary">
            {t('unitsSettings.previewLabel')}
          </Text>
          <Text variant="body" color="primary" testID="units-weight-preview">
            {t('unitsSettings.previewWeightSample', { value: weightPreview })}
          </Text>
          <Text variant="body" color="primary" testID="units-length-preview">
            {t('unitsSettings.previewLengthSample', { value: lengthPreview })}
          </Text>
        </Column>
      </Surface>
    </>
  );
}

function UnitsSkeleton() {
  return (
    <Column gap={4}>
      <Skeleton width="40%" height={16} />
      <Skeleton width="100%" height={40} radius="md" />
      <Skeleton width="40%" height={16} />
      <Skeleton width="100%" height={40} radius="md" />
    </Column>
  );
}
