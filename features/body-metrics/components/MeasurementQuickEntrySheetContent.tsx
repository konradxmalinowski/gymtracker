import { useState } from 'react';

import { Column } from '@/components/layout';
import { Button, NumberField, Text, TextField } from '@/components/ui';
import { haptics } from '@/services/haptics';
import { t } from '@/i18n';
import { space } from '@/theme/tokens';

import type { BodyMetricType } from '../domain/metrics';
import { useRecordMetricEntry } from '../hooks/useBodyMetrics';
import { useDisplayUnits } from '../hooks/useDisplayUnits';
import { displayUnitLabel } from '../hooks/metricUnits';
import { metricLabel } from './metricPresentation';

export interface MeasurementQuickEntrySheetContentProps {
  /**
   * Always opened with a metric already fixed - a per-row "+" on
   * `MeasurementsListScreen`, or the header "+" on `MetricHistoryScreen` -
   * rather than an in-sheet metric picker. Simpler, and still satisfies
   * "quick-entry modal" (`docs/ROADMAP.md`'s P13 acceptance line); a
   * generic "pick any metric then enter a value" flow was scoped out as
   * unnecessary complexity for a sheet whose entire point is speed.
   */
  metric: BodyMetricType;
  onSaved?: (() => void) | undefined;
}

/**
 * Rendered inside the app-root `SheetHost`/`BottomSheet` (`present()`d from
 * `MeasurementsListScreen`/`MetricHistoryScreen`). Owns its own
 * `valueDraft`/`noteDraft`/`formError` state and calls `useRecordMetricEntry`
 * directly, mirroring `PlanNameSheetContent`'s exact shape - "sheet content
 * owns whatever can change while it's open," since `sheetStore`'s `content`
 * is a `ReactNode` frozen at `present()` call time.
 */
export function MeasurementQuickEntrySheetContent({
  metric,
  onSaved,
}: MeasurementQuickEntrySheetContentProps) {
  const [valueDraft, setValueDraft] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const recordEntry = useRecordMetricEntry();
  const { weightUnit, lengthUnit } = useDisplayUnits();
  const unit = displayUnitLabel(metric, weightUnit ?? 'kg', lengthUnit ?? 'cm');

  async function handleSubmit() {
    setFormError(null);
    if (valueDraft === null || valueDraft <= 0) {
      setFormError(t('bodyMetrics.quickEntry.valueRequiredError'));
      return;
    }
    try {
      await recordEntry.mutateAsync({
        metric,
        displayValue: valueDraft,
        note: noteDraft.trim() ? noteDraft.trim() : null,
      });
      haptics.setCompleted();
      onSaved?.();
    } catch {
      setFormError(t('bodyMetrics.genericErrorMessage'));
    }
  }

  return (
    <Column gap={4} style={{ paddingTop: space[2] }}>
      <Text variant="title3" color="primary">
        {t('bodyMetrics.quickEntry.titleTemplate', { metric: metricLabel(metric) })}
      </Text>
      <NumberField
        value={valueDraft}
        onChange={setValueDraft}
        step={unit === '%' ? 0.1 : 0.5}
        min={0}
        precision={1}
        unitSuffix={unit}
        selectOnFocus
        accessibilityLabel={t('bodyMetrics.quickEntry.valueLabel')}
        testID="measurement-quick-entry-value-field"
      />
      {formError ? (
        <Text variant="footnote" color="danger" accessibilityLiveRegion="polite">
          {formError}
        </Text>
      ) : null}
      <TextField
        label={t('bodyMetrics.quickEntry.noteLabel')}
        value={noteDraft}
        onChangeText={setNoteDraft}
        placeholder={t('bodyMetrics.quickEntry.notePlaceholder')}
        testID="measurement-quick-entry-note-field"
      />
      <Button
        variant="primary"
        label={t('bodyMetrics.quickEntry.saveButtonLabel')}
        onPress={() => void handleSubmit()}
        loading={recordEntry.isPending}
        fullWidth
        testID="measurement-quick-entry-save"
      />
    </Column>
  );
}
