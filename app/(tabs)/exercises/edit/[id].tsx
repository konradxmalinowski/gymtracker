import { useLocalSearchParams } from 'expo-router';

import { ExerciseFormScreen } from '@/features/exercise-library/screens/ExerciseFormScreen';

export default function ExerciseEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ExerciseFormScreen mode="edit" exerciseId={id} />;
}
