import { useState } from 'react';
import { router } from 'expo-router';

import { Column } from '@/components/layout';
import { Button, TextField } from '@/components/ui';
import { PlanValidationError } from '@/features/plans';
import { t } from '@/i18n';
import { routes } from '@/navigation/routes';
import type { EntityId } from '@/repositories/contracts/repository';
import { useSheetStore } from '@/stores/sheetStore';
import { space } from '@/theme/tokens';

import { useCreatePlan, useRenamePlan } from '../hooks/usePlanMutations';

export interface PlanNameSheetContentProps {
  mode: 'create' | 'rename';
  planId?: EntityId;
  initialName?: string;
}

/**
 * Rendered inside the app-root `SheetHost`/`BottomSheet` (`present()`d from
 * `PlanListScreen`). Owns its own `nameInput`/`formError` state and calls
 * `useCreatePlan`/`useRenamePlan` directly rather than reading them from the
 * presenting screen - the same "sheet content owns whatever can change while
 * it's open" shape `CalendarDaySessionPicker`/`ExerciseFilterSheetContent`
 * already establish: `sheetStore`'s `content` is a `ReactNode` frozen at
 * `present()` call time, so a screen-level `useState` update (the typed
 * `nameInput`) would never reach an already-rendered sheet element.
 */
export function PlanNameSheetContent({ mode, planId, initialName = '' }: PlanNameSheetContentProps) {
  const [nameInput, setNameInput] = useState(initialName);
  const [formError, setFormError] = useState<string | null>(null);
  const createPlan = useCreatePlan();
  const renamePlan = useRenamePlan();
  const dismiss = useSheetStore((state) => state.dismissCurrent);

  async function handleSubmit() {
    setFormError(null);
    try {
      if (mode === 'create') {
        const created = await createPlan.mutateAsync({ name: nameInput });
        dismiss();
        router.push(routes.plans.detail(created.id));
      } else if (planId) {
        await renamePlan.mutateAsync({ id: planId, name: nameInput });
        dismiss();
      }
    } catch (error) {
      if (error instanceof PlanValidationError) {
        setFormError(error.issues[0]?.message ?? t('plans.list.genericErrorMessage'));
      } else {
        setFormError(t('plans.list.genericErrorMessage'));
      }
    }
  }

  return (
    <Column gap={4} style={{ paddingTop: space[2] }}>
      <TextField
        label={mode === 'rename' ? t('plans.list.renameDialogTitle') : t('plans.list.createDialogTitle')}
        value={nameInput}
        onChangeText={setNameInput}
        placeholder={t('plans.list.namePlaceholder')}
        error={formError ?? undefined}
        testID="plan-name-sheet-field"
      />
      <Button
        variant="primary"
        label={t('common.save')}
        onPress={() => void handleSubmit()}
        loading={createPlan.isPending || renamePlan.isPending}
        fullWidth
        testID="plan-name-sheet-save"
      />
    </Column>
  );
}
