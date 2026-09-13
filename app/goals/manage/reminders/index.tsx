import { ReminderListScreen } from '@/features/daily-goals/screens/ReminderListScreen';

/** Thin wrapper into `ReminderListScreen` (CLAUDE.md: "app/ never contains screen bodies"). */
export default function GoalsManageRemindersIndex() {
  return <ReminderListScreen />;
}
