import { useLocalSearchParams } from 'expo-router';

import { GoalFormScreen } from '@/features/daily-goals/screens/GoalFormScreen';

/** Thin wrapper into `GoalFormScreen` (CLAUDE.md: "app/ never contains screen bodies"). */
export default function GoalsManageEdit() {
  const { goalId } = useLocalSearchParams<{ goalId: string }>();
  return <GoalFormScreen mode="edit" goalId={goalId} />;
}
