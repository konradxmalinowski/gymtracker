import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';

import { PlanDayPickerScreen } from '@/features/home/screens/PlanDayPickerScreen';

/**
 * Thin wrapper into `PlanDayPickerScreen` (CLAUDE.md: "app/ never contains
 * screen bodies"), the third `(modals)` route after P5's `exercise-picker.tsx`
 * and P7's `rest-timer-settings.tsx`, on the same conventions: imports the
 * screen from its concrete path (screens are never barrel-exported), `planId`
 * as a plain route param (see `navigation/routes.ts`'s `planDayPicker` doc
 * comment for why this is the single-id-param shape, not `exercisePicker`'s
 * store).
 */
export default function PlanDayPicker() {
  const { planId } = useLocalSearchParams<{ planId: string }>();

  // Defensive only, mirroring `exercise-picker.tsx`/`rest-timer-settings.tsx`'s
  // own "reached some other way than the real in-app flow" guard.
  useEffect(() => {
    if (!planId && router.canGoBack()) {
      router.back();
    }
  }, [planId]);

  if (!planId) {
    return null;
  }

  return <PlanDayPickerScreen planId={planId} />;
}
