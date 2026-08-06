import { useLocalSearchParams } from 'expo-router';

import { PlanDayEditorScreen } from '@/features/plans/screens/PlanDayEditorScreen';

export default function PlanDayEditor() {
  const { planId, dayId } = useLocalSearchParams<{ planId: string; dayId: string }>();
  return <PlanDayEditorScreen planId={planId} dayId={dayId} />;
}
