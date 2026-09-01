import { useLocalSearchParams } from 'expo-router';

import { PhotoCompareScreen } from '@/features/body-metrics/screens/PhotoCompareScreen';

export default function BodyMetricsPhotoCompare() {
  const { photoIdA, photoIdB } = useLocalSearchParams<{ photoIdA: string; photoIdB: string }>();
  return <PhotoCompareScreen photoIdA={photoIdA} photoIdB={photoIdB} />;
}
