import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image, View } from 'react-native';
import { Stack } from 'expo-router';

import { Column, Row, Screen } from '@/components/layout';
import { Text } from '@/components/ui';
import { ErrorState, Skeleton } from '@/components/feedback';
import { PROGRESS_PHOTO_DIRECTORY, type ProgressPhoto } from '@/features/body-metrics';
import { t } from '@/i18n';
import { useContainer } from '@/services/container';
import { color, space } from '@/theme/tokens';

import { formatBodyMetricsDate } from '../components/formatBodyMetricsDate';
import { poseLabel } from '../components/metricPresentation';
import { usePhotoList } from '../hooks/usePhotos';

export interface PhotoCompareScreenProps {
  photoIdA: string | undefined;
  photoIdB: string | undefined;
}

/** `app/body-metrics/photos/compare.tsx`'s screen body - side-by-side, each image's missing-file handling fully independent so one photo missing never blocks the other from rendering. */
export function PhotoCompareScreen({ photoIdA, photoIdB }: PhotoCompareScreenProps) {
  const { data, isPending, isError, refetch } = usePhotoList();

  const allPhotos = useMemo(() => data?.pages.flat() ?? [], [data]);
  const photoA = allPhotos.find((entry) => entry.id === photoIdA);
  const photoB = allPhotos.find((entry) => entry.id === photoIdB);

  return (
    <Screen scroll testID="body-metrics-photo-compare-screen" edges={['bottom']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t('bodyMetrics.compare.screenTitle'),
          headerStyle: { backgroundColor: color.background },
          headerTintColor: color.textPrimary,
          headerShadowVisible: false,
        }}
      />

      {isPending ? (
        <Row gap={2} style={{ padding: space[4] }}>
          <Skeleton width="48%" height={320} radius="lg" />
          <Skeleton width="48%" height={320} radius="lg" />
        </Row>
      ) : null}

      {isError ? (
        <ErrorState error={t('bodyMetrics.photos.loadErrorMessage')} onRetry={() => refetch()} />
      ) : null}

      {!isPending && !isError ? (
        <Row gap={2} style={{ padding: space[4] }} align="flex-start">
          <ComparePane photo={photoA} testID="body-metrics-compare-pane-a" />
          <ComparePane photo={photoB} testID="body-metrics-compare-pane-b" />
        </Row>
      ) : null}
    </Screen>
  );
}

function ComparePane({ photo, testID }: { photo: ProgressPhoto | undefined; testID: string }) {
  const { files } = useContainer();
  const [failed, setFailed] = useState(false);

  if (!photo) {
    return (
      <View style={{ flex: 1 }}>
        <View
          style={{
            aspectRatio: 3 / 4,
            borderRadius: 16,
            backgroundColor: color.surface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="alert-circle-outline" size={32} color={color.textTertiary} />
        </View>
      </View>
    );
  }

  return (
    <View testID={testID} style={{ flex: 1 }}>
      <Column gap={2}>
        <View
          style={{
            aspectRatio: 3 / 4,
            borderRadius: 16,
            overflow: 'hidden',
            backgroundColor: color.surface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {failed ? (
            <Column gap={2} align="center">
              <Ionicons name="image-outline" size={32} color={color.textTertiary} />
              <Text variant="caption" color="tertiary" align="center">
                {t('bodyMetrics.compare.missingImageMessage')}
              </Text>
            </Column>
          ) : (
            <Image
              source={{ uri: files.getUri(`${PROGRESS_PHOTO_DIRECTORY}/${photo.fileName}`) }}
              style={{ width: '100%', height: '100%' }}
              onError={() => setFailed(true)}
              accessibilityIgnoresInvertColors
              accessibilityLabel={t('bodyMetrics.photos.thumbnailAccessibilityLabelTemplate', {
                pose: poseLabel(photo.pose),
                date: formatBodyMetricsDate(photo.takenAt),
              })}
            />
          )}
        </View>
        <Text variant="footnote" color="secondary" align="center">
          {formatBodyMetricsDate(photo.takenAt)}
        </Text>
      </Column>
    </View>
  );
}
