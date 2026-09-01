import { useLocalSearchParams } from 'expo-router';

import { PhotoDetailScreen } from '@/features/body-metrics/screens/PhotoDetailScreen';

export default function BodyMetricsPhotoDetail() {
  const { photoId } = useLocalSearchParams<{ photoId: string }>();
  return <PhotoDetailScreen photoId={photoId} />;
}
