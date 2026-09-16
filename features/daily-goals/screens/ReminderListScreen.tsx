import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { router } from 'expo-router';

import { Column, Screen } from '@/components/layout';
import { Button } from '@/components/ui';
import { EmptyState, ErrorState, Skeleton, ConfirmDialog } from '@/components/feedback';
import { t } from '@/i18n';
import { routes } from '@/navigation/routes';
import { haptics } from '@/services/haptics';
import { useSheetStore } from '@/stores/sheetStore';
import { color, space } from '@/theme/tokens';

import { ReminderFormSheetContent } from '../components/ReminderFormSheetContent';
import { ReminderRow } from '../components/ReminderRow';
import { useAllGoals } from '../hooks/useDailyGoals';
import {
  useAllReminders,
  useDeleteReminder,
  useSetReminderEnabled,
} from '../hooks/useDailyReminders';
import type { DailyReminder } from '../types/DailyReminder';

const REMINDER_FORM_SHEET_ID = 'daily-reminder-form';

/**
 * `app/(tabs)/goals/manage/reminders/index.tsx`'s screen body - every reminder,
 * standalone and goal-linked alike (`docs/ROADMAP.md` P17's own reminder
 * management acceptance line). `useAllGoals` is fetched alongside purely to
 * resolve each row's "linked to X" label and to populate the sheet's goal
 * picker - a small, deliberate cross-read within this one feature's own
 * screens (not a cross-feature barrel reach, `daily-goals` stays a total
 * leaf per ARCHITECTURE.md section 9.1).
 */
export function ReminderListScreen() {
  const { data, isPending, isError, refetch } = useAllReminders();
  const goals = useAllGoals();
  const setReminderEnabled = useSetReminderEnabled();
  const deleteReminder = useDeleteReminder();

  const [deleteTarget, setDeleteTarget] = useState<DailyReminder | null>(null);

  useEffect(() => {
    if (isPending) {
      AccessibilityInfo.announceForAccessibility(t('common.loading'));
    } else if (!isError && data && data.length === 0) {
      AccessibilityInfo.announceForAccessibility(t('dailyGoals.reminders.emptyTitle'));
    }
  }, [isPending, isError, data]);

  function goalNameFor(goalId: string | null): string | null {
    if (!goalId) {
      return null;
    }
    return goals.data?.find((goal) => goal.id === goalId)?.name ?? null;
  }

  function openCreateSheet() {
    useSheetStore.getState().present({
      id: REMINDER_FORM_SHEET_ID,
      content: <ReminderFormSheetContent mode="create" goals={goals.data ?? []} />,
      snapPoints: [0.85],
    });
  }

  function openEditSheet(reminder: DailyReminder) {
    useSheetStore.getState().present({
      id: REMINDER_FORM_SHEET_ID,
      content: (
        <ReminderFormSheetContent mode="edit" reminder={reminder} goals={goals.data ?? []} />
      ),
      snapPoints: [0.85],
    });
  }

  function handleToggleEnabled(reminder: DailyReminder, isEnabled: boolean) {
    haptics.select();
    setReminderEnabled.mutate({ reminder, isEnabled });
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) {
      return;
    }
    const target = deleteTarget;
    setDeleteTarget(null);
    haptics.destructive();
    await deleteReminder.mutateAsync(target.id);
  }

  return (
    <Screen testID="reminder-list-screen" padded={false} edges={['bottom']}>
      <Column gap={3} style={{ flex: 1 }}>
        {isPending ? (
          <ReminderListSkeleton />
        ) : isError ? (
          <ErrorState
            error={t('dailyGoals.reminders.loadErrorMessage')}
            onRetry={() => refetch()}
          />
        ) : !data || data.length === 0 ? (
          <EmptyState
            illustration={
              <Ionicons name="notifications-outline" size={48} color={color.textTertiary} />
            }
            title={t('dailyGoals.reminders.emptyTitle')}
            message={t('dailyGoals.reminders.emptyMessage')}
            actionLabel={t('dailyGoals.reminders.createButtonLabel')}
            onAction={openCreateSheet}
            testID="reminder-list-empty-state"
          />
        ) : (
          <Column style={{ flex: 1 }}>
            {data.map((reminder) => (
              <ReminderRow
                key={reminder.id}
                reminder={reminder}
                linkedGoalName={goalNameFor(reminder.goalId)}
                onPress={() => openEditSheet(reminder)}
                onToggleEnabled={(isEnabled) => handleToggleEnabled(reminder, isEnabled)}
                onViewStats={() => router.push(routes.goals.reminderStats(reminder.id))}
                onDelete={() => setDeleteTarget(reminder)}
                testID={`reminder-row-${reminder.id}`}
              />
            ))}
          </Column>
        )}

        {data && data.length > 0 ? (
          <Column style={{ paddingHorizontal: space[4], paddingBottom: space[4] }}>
            <Button
              variant="primary"
              label={t('dailyGoals.reminders.createButtonLabel')}
              onPress={openCreateSheet}
              fullWidth
              testID="reminder-list-create-button"
            />
          </Column>
        ) : null}
      </Column>

      <ConfirmDialog
        visible={deleteTarget !== null}
        title={t('dailyGoals.reminders.deleteConfirmTitle')}
        message={t('dailyGoals.reminders.deleteConfirmMessageTemplate', {
          name: deleteTarget?.name ?? '',
        })}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setDeleteTarget(null)}
        testID="reminder-delete-confirm-dialog"
      />
    </Screen>
  );
}

function ReminderListSkeleton() {
  return (
    <Column gap={4} style={{ padding: space[4] }}>
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} width="100%" height={64} radius="lg" />
      ))}
    </Column>
  );
}
