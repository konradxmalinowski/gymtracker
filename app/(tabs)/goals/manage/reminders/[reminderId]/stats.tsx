import { useLocalSearchParams } from 'expo-router';

import { ReminderStatsScreen } from '@/features/daily-goals/screens/ReminderStatsScreen';

/** Thin wrapper into `ReminderStatsScreen` (CLAUDE.md: "app/ never contains screen bodies"). */
export default function GoalsManageReminderStats() {
  const { reminderId } = useLocalSearchParams<{ reminderId: string }>();
  return <ReminderStatsScreen reminderId={reminderId} />;
}
