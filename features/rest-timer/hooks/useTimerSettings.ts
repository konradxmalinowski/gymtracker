import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { SettingsKey, SettingsValue } from '@/repositories/settings';
import { useContainer } from '@/services/container';
import { kv } from '@/services/kv';

/**
 * Global rest-timer defaults (Step 0 decision 4's standalone settings
 * screen, `plans/2026-08-08-p7-rest-timer.md`). Mirrors
 * `features/profile/hooks/useSettings.ts`'s query-plus-mutation shape
 * exactly (per-key query, `onSuccess` writes the cache synchronously so a
 * toggle reads back instantly rather than waiting on a refetch), factored
 * into one generic `useSettingsField` so five near-identical copies of the
 * same template don't have to be hand-maintained in parallel (code review
 * finding, P7 pass 3 follow-up).
 *
 * Deliberately NOT re-exported from the `rest-timer` barrel - its only
 * consumer is this feature's own `TimerSettingsScreen`, and `useContainer()`
 * pulls in `services/container.ts`, which transitively imports
 * `workout-logging` (for `WorkoutSessionService`), which imports this
 * feature's barrel back (for `resolveRestSeconds`). Exporting this hook from
 * the barrel would close that into a real `import/no-cycle` violation - the
 * same class of cycle `app/(modals)/exercise-picker.tsx`'s file header
 * documents hitting once already, and the same reason `useRestTimerTick`
 * (which *is* barrel-exported) takes `Clock` as a plain parameter instead of
 * reading it from `useContainer()` itself.
 *
 * `timer.vibration` is the one field mirrored into MMKV (`services/kv`) on a
 * successful write - the same pattern `haptics.enabled`/`units.*` already
 * use (ADR-0008 MMKV key inventory), needed here because
 * `useRestTimerTick`'s expiry-triggered `haptics.timerFinished()` call fires
 * from a Zustand store subscription callback, not a component render, and
 * has no business awaiting an async settings read to decide whether to
 * vibrate. `timer.sound`/`timer.notification`/`timer.autoStart`/
 * `timer.defaultRestSeconds` have no such synchronous consumer, so they stay
 * unmirrored.
 */
function useSettingsField<K extends SettingsKey>(
  key: K,
  mirror?: (value: SettingsValue<K>) => void,
) {
  const { settings } = useContainer();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['settings', key],
    queryFn: () => settings.get(key),
  });

  const mutation = useMutation({
    // Serializes rapid double-taps into one write queue per key, same guard
    // `useHapticsSetting`/`useUnitsSettings` already use.
    scope: { id: `settings:${key}` },
    mutationFn: async (value: SettingsValue<K>) => {
      await settings.set(key, value);
      mirror?.(value);
      return value;
    },
    onSuccess: (value) => {
      queryClient.setQueryData(['settings', key], value);
    },
  });

  return {
    value: query.data,
    isPending: query.isPending,
    setValue: mutation.mutate,
  };
}

export function useTimerSettings() {
  const defaultRestSeconds = useSettingsField('timer.defaultRestSeconds');
  const sound = useSettingsField('timer.sound');
  const vibration = useSettingsField('timer.vibration', (value) =>
    kv.set('timer.vibration', value),
  );
  const notification = useSettingsField('timer.notification');
  const autoStart = useSettingsField('timer.autoStart');

  return {
    defaultRestSeconds: defaultRestSeconds.value,
    sound: sound.value,
    vibration: vibration.value,
    notification: notification.value,
    autoStart: autoStart.value,
    isPending:
      defaultRestSeconds.isPending ||
      sound.isPending ||
      vibration.isPending ||
      notification.isPending ||
      autoStart.isPending,
    setDefaultRestSeconds: defaultRestSeconds.setValue,
    setSound: sound.setValue,
    setVibration: vibration.setValue,
    setNotification: notification.setValue,
    setAutoStart: autoStart.setValue,
  };
}
