import { useLocalSearchParams } from 'expo-router';

import { WorkoutSummaryScreen } from '@/features/workout-logging/screens/WorkoutSummaryScreen';

export default function WorkoutSummary() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return <WorkoutSummaryScreen sessionId={sessionId} />;
}
