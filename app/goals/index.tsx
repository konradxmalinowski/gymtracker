import { DailyGoalsScreen } from '@/features/daily-goals/screens/DailyGoalsScreen';

/** Thin wrapper into `DailyGoalsScreen` (CLAUDE.md: "app/ never contains screen bodies"). */
export default function GoalsIndex() {
  return <DailyGoalsScreen />;
}
