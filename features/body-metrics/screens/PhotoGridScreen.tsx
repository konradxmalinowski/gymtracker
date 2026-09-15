import { useEffect, useMemo, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { FlashList } from '@shopify/flash-list';
import { AccessibilityInfo, View } from 'react-native';
import { router, Stack } from 'expo-router';

import { Screen } from '@/components/layout';
import { Button, IconButton, Text } from '@/components/ui';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback';
import { PROGRESS_PHOTO_DIRECTORY } from '@/features/body-metrics';
import { t } from '@/i18n';
import { routes } from '@/navigation/routes';
import { useContainer } from '@/services/container';
import { useSheetStore } from '@/stores/sheetStore';
import { color, space } from '@/theme/tokens';

import { PhotoSourceSheetContent } from '../components/PhotoSourceSheetContent';
import { PhotoGridCell } from '../components/PhotoGridCell';
import { formatBodyMetricsDate } from '../components/formatBodyMetricsDate';
import { poseLabel } from '../components/metricPresentation';
import { usePhotoList } from '../hooks/usePhotos';
import type { ProgressPhoto } from '../types/ProgressPhoto';

const PHOTO_SOURCE_SHEET_ID = 'body-metrics-photo-source';
const NUM_COLUMNS = 3;
const GRID_GAP = space[2];
/** `Skeleton`'s `width` prop type is a literal `` `${number}%` `` template, which a runtime-computed division does not narrow to - a fixed, precomputed literal for this fixed 3-column layout instead. */
const SKELETON_CELL_WIDTH: `${number}%` = '31%';

/** `app/body-metrics/photos/index.tsx`'s screen body. */
export function PhotoGridScreen() {
  const { files } = useContainer();
  const { data, isPending, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    usePhotoList();
  const [compareMode, setCompareMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const photos: ProgressPhoto[] = useMemo(() => data?.pages.flat() ?? [], [data]);
  const isEmpty = !isPending && !isError && photos.length === 0;

  useEffect(() => {
    if (isPending) {
      AccessibilityInfo.announceForAccessibility(t('common.loading'));
    } else if (isEmpty) {
      AccessibilityInfo.announceForAccessibility(t('bodyMetrics.photos.emptyTitle'));
    }
  }, [isPending, isEmpty]);

  function openPhotoSource() {
    useSheetStore.getState().present({
      id: PHOTO_SOURCE_SHEET_ID,
      // Simpler choice, documented: on success the sheet just dismisses back
      // to the grid (which already invalidates and refetches) rather than
      // routing straight into the new photo's detail screen - a second push
      // right after a modal dismiss reads as more surprising than useful
      // here, since the new thumbnail is already visible at the top of the
      // grid the user is looking at.
      content: (
        <PhotoSourceSheetContent onAdded={() => useSheetStore.getState().dismissCurrent()} />
      ),
      snapPoints: [0.35],
    });
  }

  function toggleCompareMode() {
    setCompareMode((value) => !value);
    setSelectedIds([]);
  }

  function toggleSelected(photoId: string) {
    setSelectedIds((current) => {
      if (current.includes(photoId)) {
        return current.filter((id) => id !== photoId);
      }
      if (current.length >= 2) {
        return [current[1] as string, photoId];
      }
      return [...current, photoId];
    });
  }

  function handleCellPress(photo: ProgressPhoto) {
    if (compareMode) {
      toggleSelected(photo.id);
      return;
    }
    router.push(routes.bodyMetrics.photoDetail(photo.id));
  }

  function handleCompare() {
    const [first, second] = selectedIds;
    if (!first || !second) return;
    router.push(routes.bodyMetrics.compare(first, second));
    setCompareMode(false);
    setSelectedIds([]);
  }

  return (
    <Screen testID="body-metrics-photo-grid-screen" padded={false} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t('bodyMetrics.photos.screenTitle'),
          headerStyle: { backgroundColor: color.background },
          headerTintColor: color.textPrimary,
          headerShadowVisible: false,
          headerRight: () =>
            isEmpty ? null : (
              <View style={{ flexDirection: 'row', gap: space[1] }}>
                <IconButton
                  icon={
                    <Ionicons
                      name={compareMode ? 'close' : 'git-compare-outline'}
                      size={20}
                      color={color.accent}
                    />
                  }
                  variant="ghost"
                  accessibilityLabel={
                    compareMode
                      ? t('bodyMetrics.photos.cancelCompareButtonLabel')
                      : t('bodyMetrics.photos.compareButtonLabel')
                  }
                  onPress={toggleCompareMode}
                  testID="body-metrics-photo-compare-toggle"
                />
                {!compareMode ? (
                  <IconButton
                    icon={<Ionicons name="add" size={20} color={color.accent} />}
                    variant="ghost"
                    accessibilityLabel={t('bodyMetrics.photos.addAccessibilityLabel')}
                    onPress={openPhotoSource}
                    testID="body-metrics-photo-add-button"
                  />
                ) : null}
              </View>
            ),
        }}
      />

      {compareMode ? (
        <View style={{ padding: space[4], paddingBottom: 0 }}>
          <Text variant="footnote" color="secondary">
            {t('bodyMetrics.photos.compareModeHint')}
          </Text>
        </View>
      ) : null}

      <View style={{ flex: 1 }}>
        {isPending ? (
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: GRID_GAP,
              padding: space[4],
            }}
          >
            {[0, 1, 2, 3, 4, 5].map((cell) => (
              <Skeleton key={cell} width={SKELETON_CELL_WIDTH} height={110} radius="md" />
            ))}
          </View>
        ) : null}

        {isError ? (
          <ErrorState error={t('bodyMetrics.photos.loadErrorMessage')} onRetry={() => refetch()} />
        ) : null}

        {isEmpty ? (
          <EmptyState
            illustration={<Ionicons name="camera-outline" size={40} color={color.textTertiary} />}
            title={t('bodyMetrics.photos.emptyTitle')}
            message={t('bodyMetrics.photos.emptyMessage')}
            actionLabel={t('bodyMetrics.photos.addAccessibilityLabel')}
            onAction={openPhotoSource}
            testID="body-metrics-photo-grid-empty-state"
          />
        ) : null}

        {!isPending && !isError && photos.length > 0 ? (
          <FlashList
            data={photos}
            numColumns={NUM_COLUMNS}
            keyExtractor={(photo) => photo.id}
            contentContainerStyle={{ padding: space[4] }}
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage) {
                void fetchNextPage();
              }
            }}
            onEndReachedThreshold={0.5}
            renderItem={({ item }: { item: ProgressPhoto }) => {
              const dateLabel = formatBodyMetricsDate(item.takenAt);
              const pose = poseLabel(item.pose);
              const selected = selectedIds.includes(item.id);
              return (
                <View
                  style={{
                    flex: 1 / NUM_COLUMNS,
                    padding: GRID_GAP / 2,
                  }}
                >
                  <PhotoGridCell
                    uri={files.getUri(`${PROGRESS_PHOTO_DIRECTORY}/${item.thumbName}`)}
                    accessibilityLabel={
                      compareMode
                        ? t(
                            selected
                              ? 'bodyMetrics.photos.deselectAccessibilityLabelTemplate'
                              : 'bodyMetrics.photos.selectAccessibilityLabelTemplate',
                            { pose, date: dateLabel },
                          )
                        : t('bodyMetrics.photos.thumbnailAccessibilityLabelTemplate', {
                            pose,
                            date: dateLabel,
                          })
                    }
                    selectable={compareMode}
                    selected={selected}
                    onPress={() => handleCellPress(item)}
                    testID={`body-metrics-photo-cell-${item.id}`}
                  />
                </View>
              );
            }}
            testID="body-metrics-photo-grid"
          />
        ) : null}
      </View>

      {compareMode && selectedIds.length === 2 ? (
        <View style={{ padding: space[4] }}>
          <Button
            variant="primary"
            label={t('bodyMetrics.photos.compareReadyLabel')}
            onPress={handleCompare}
            fullWidth
            testID="body-metrics-photo-compare-action"
          />
        </View>
      ) : null}
    </Screen>
  );
}
