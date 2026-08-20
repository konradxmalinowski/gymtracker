import { useState } from 'react';

import { Column } from '@/components/layout';
import { Button, TextField } from '@/components/ui';
import { PlanValidationError } from '@/features/plans';
import { t } from '@/i18n';
import type { EntityId } from '@/repositories/contracts/repository';
import { useSheetStore } from '@/stores/sheetStore';
import { space } from '@/theme/tokens';

import { useAddDay, useRenameDay } from '../hooks/useDayMutations';
import { useRenamePlan } from '../hooks/usePlanMutations';

export type PlanDetailSheetKind = 'renamePlan' | 'addDay' | 'renameDay';

export interface PlanDetailNameSheetContentProps {
  kind: PlanDetailSheetKind;
  planId: EntityId;
  dayId?: EntityId;
  initialName?: string;
}

/**
 * Rendered inside the app-root `SheetHost`/`BottomSheet` (`present()`d from
 * `PlanDetailScreen`). Owns its own `nameInput`/`formError` state and calls
 * `useRenamePlan`/`useAddDay`/`useRenameDay` directly - same "sheet content
 * owns whatever can change while it's open" shape `PlanNameSheetContent`
 * already establishes for `PlanListScreen`'s equivalent sheet.
 */
export function PlanDetailNameSheetContent({
  kind,
  planId,
  dayId,
  initialName = '',
}: PlanDetailNameSheetContentProps) {
  const [nameInput, setNameInput] = useState(initialName);
  const [formError, setFormError] = useState<string | null>(null);
  const renamePlan = useRenamePlan();
  const addDay = useAddDay();
  const renameDay = useRenameDay();
  const dismiss = useSheetStore((state) => state.dismissCurrent);

  async function handleSubmit() {
    setFormError(null);
    try {
      if (kind === 'renamePlan') {
        await renamePlan.mutateAsync({ id: planId, name: nameInput });
      } else if (kind === 'addDay') {
        await addDay.mutateAsync({ planId, input: { name: nameInput } });
      } else if (kind === 'renameDay' && dayId) {
        await renameDay.mutateAsync({ dayId, name: nameInput });
      }
      dismiss();
    } catch (error) {
      if (error instanceof PlanValidationError) {
        setFormError(error.issues[0]?.message ?? t('plans.detail.genericErrorMessage'));
      } else {
        setFormError(t('plans.detail.genericErrorMessage'));
      }
    }
  }

  return (
    <Column gap={4} style={{ paddingTop: space[2] }}>
      <TextField
        label={
          kind === 'renamePlan'
            ? t('plans.list.renameDialogTitle')
            : kind === 'renameDay'
              ? t('plans.detail.renameDayDialogTitle')
              : t('plans.detail.addDayDialogTitle')
        }
        value={nameInput}
        onChangeText={setNameInput}
        placeholder={
          kind === 'addDay' || kind === 'renameDay'
            ? t('plans.detail.dayNamePlaceholder')
            : t('plans.list.namePlaceholder')
        }
        error={formError ?? undefined}
        testID="plan-detail-name-sheet-field"
      />
      <Button
        variant="primary"
        label={t('common.save')}
        onPress={() => void handleSubmit()}
        loading={renamePlan.isPending || addDay.isPending || renameDay.isPending}
        fullWidth
        testID="plan-detail-name-sheet-save"
      />
    </Column>
  );
}
