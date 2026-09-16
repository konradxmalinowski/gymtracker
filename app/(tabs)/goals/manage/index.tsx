import { GoalListScreen } from '@/features/daily-goals/screens/GoalListScreen';

/** Thin wrapper into `GoalListScreen` (CLAUDE.md: "app/ never contains screen bodies"). */
export default function GoalsManageIndex() {
  return <GoalListScreen />;
}
