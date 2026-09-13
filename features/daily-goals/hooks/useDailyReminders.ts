import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  CreateDailyReminderInput,
  DailyReminder,
  UpdateDailyReminderPatch,
} from '@/features/daily-goals';
import type { EntityId } from '@/repositories/contracts/repository';
import { useContainer } from '@/services/container';
import type { NotificationScheduler } from '@/services/notifications';

import { invalidateDailyReminderQueries } from './invalidation';
import { dailyReminderKeys } from './queryKeys';

/**
 * Same "confined to `app/goals/**`'s own screens" DI shape as
 * `useDailyGoals.ts` - see that file's own header comment for the full
 * reasoning.
 *
 * Every mutation that can change what should fire today also re-arms
 * `NotificationScheduler` immediately (ADR-0017 Decision 3's own
 * "recompute on every foreground/boot," extended here per this pass's brief
 * to "and immediately on every settings change too," the exact
 * `RemindersSettingsScreen.applySchedule` precedent for the *other* local
 * reminder feature in this app) rather than leaving the OS schedule stale
 * until the next app foreground - persisting to the database alone would
 * otherwise leave `NotificationScheduler` inert until a boot/foreground gate
 * fired the next re-arm sweep, which could be hours away.
 */

function scheduleFor(notifications: NotificationScheduler, reminder: DailyReminder): void {
  if (reminder.isEnabled) {
    void notifications.scheduleRemainingOccurrencesToday(reminder, new Date());
  } else {
    void notifications.cancelForReminder(reminder.id);
  }
}

/** `ReminderListScreen`'s own read - every non-deleted reminder, standalone and goal-linked alike. */
export function useAllReminders() {
  const { dailyReminderService } = useContainer();

  return useQuery({
    queryKey: dailyReminderKeys.list,
    queryFn: () => dailyReminderService.listAll(),
  });
}

/** `ReminderListScreen`'s edit-mode read for one reminder. `id` may be `undefined` while the sheet/form is still resolving which reminder it edits. */
export function useReminder(id: EntityId | undefined) {
  const { dailyReminderService } = useContainer();

  return useQuery({
    queryKey: dailyReminderKeys.detail(id ?? ''),
    queryFn: () => dailyReminderService.getReminder(id as EntityId),
    enabled: Boolean(id),
  });
}

/** @throws {DailyReminderValidationError} */
export function useCreateReminder() {
  const { dailyReminderService, notifications } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateDailyReminderInput) => dailyReminderService.createReminder(input),
    onSuccess: (reminder) => {
      invalidateDailyReminderQueries(queryClient);
      scheduleFor(notifications, reminder);
    },
  });
}

/** @throws {DailyReminderValidationError} */
export function useUpdateReminder() {
  const { dailyReminderService, notifications } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, patch }: { id: EntityId; patch: UpdateDailyReminderPatch }) =>
      dailyReminderService.updateReminder(id, patch),
    onSuccess: (reminder) => {
      queryClient.removeQueries({ queryKey: dailyReminderKeys.detail(reminder.id) });
      invalidateDailyReminderQueries(queryClient);
      scheduleFor(notifications, reminder);
    },
  });
}

/**
 * Hard delete, confirm-gated (`DailyReminderService.deleteReminder`'s own
 * doc comment) - no matching restore hook. Cancels the reminder's own
 * pending OS notifications on success, mirroring `WorkoutReminderService
 * .cancelAll()`'s "delete/disable must not leave a stale schedule behind"
 * posture, scoped to just this one reminder's own prefix
 * (`NotificationScheduler.cancelForReminder`'s own doc comment on why it's
 * never the feature-wide cancel-all).
 */
export function useDeleteReminder() {
  const { dailyReminderService, notifications } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: EntityId) => dailyReminderService.deleteReminder(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: dailyReminderKeys.detail(id) });
      invalidateDailyReminderQueries(queryClient);
      void notifications.cancelForReminder(id);
    },
  });
}

/**
 * This feature's "pause without losing history" affordance
 * (`DailyReminderService.setEnabled`'s own doc comment). Takes the full
 * `reminder` object (already on hand from `ReminderListScreen`'s own loaded
 * list) rather than refetching it after the write, purely so this can
 * schedule/cancel immediately without a second round trip - `setEnabled`
 * itself returns `void`, so there is nothing to schedule from without it.
 */
export function useSetReminderEnabled() {
  const { dailyReminderService, notifications } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ reminder, isEnabled }: { reminder: DailyReminder; isEnabled: boolean }) =>
      dailyReminderService.setEnabled(reminder.id, isEnabled),
    onSuccess: (_data, variables) => {
      invalidateDailyReminderQueries(queryClient);
      scheduleFor(notifications, { ...variables.reminder, isEnabled: variables.isEnabled });
    },
  });
}

/** `ReminderStatsScreen`'s own read - `{ done, notDone, ignored }` over `[dateRangeFrom, dateRangeTo]`. */
export function useReminderStats(
  id: EntityId | undefined,
  dateRangeFrom: string,
  dateRangeTo: string,
) {
  const { dailyReminderService } = useContainer();

  return useQuery({
    queryKey: dailyReminderKeys.stats(id ?? '', dateRangeFrom, dateRangeTo),
    queryFn: () =>
      dailyReminderService.getReminderStats(id as EntityId, dateRangeFrom, dateRangeTo),
    enabled: Boolean(id),
  });
}
