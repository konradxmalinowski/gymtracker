import { GoalFormScreen } from '@/features/daily-goals/screens/GoalFormScreen';

/** Thin wrapper into `GoalFormScreen` (CLAUDE.md: "app/ never contains screen bodies"). */
export default function GoalsManageCreate() {
  return <GoalFormScreen mode="create" />;
}
