import { useLocalSearchParams } from 'expo-router';

import { WorkoutHistoryDetailScreen } from '@/features/workout-logging/screens/WorkoutHistoryDetailScreen';

export default function HistoryDetail() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return <WorkoutHistoryDetailScreen sessionId={sessionId} />;
}
