import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image, View } from 'react-native';
import { router, Stack } from 'expo-router';

import { Column, Row, Screen } from '@/components/layout';
import { Button, SegmentedControl, Surface, Text, TextField } from '@/components/ui';
import { ConfirmDialog, EmptyState, ErrorState, Skeleton } from '@/components/feedback';
import { PROGRESS_PHOTO_DIRECTORY } from '@/features/body-metrics';
import { haptics } from '@/services/haptics';
import { t } from '@/i18n';
import { useContainer } from '@/services/container';
import { useToastStore } from '@/stores/toastStore';
import { color, space } from '@/theme/tokens';

import { formatBodyMetricsDate } from '../components/formatBodyMetricsDate';
import { poseLabel } from '../components/metricPresentation';
import {
  useDeletePhoto,
  usePermanentlyDeletePhoto,
  usePhotoList,
  useRestorePhoto,
  useUpdatePhoto,
} from '../hooks/usePhotos';
import type { PhotoPose } from '../types/ProgressPhoto';

export interface PhotoDetailScreenProps {
  photoId: string | undefined;
}

const POSE_OPTIONS: { value: PhotoPose; label: string }[] = [
  { value: 'front', label: t('bodyMetrics.photoDetail.pose.front') },
  { value: 'side', label: t('bodyMetrics.photoDetail.pose.side') },
  { value: 'back', label: t('bodyMetrics.photoDetail.pose.back') },
  { value: 'other', label: t('bodyMetrics.photoDetail.pose.other') },
];

/**
 * `app/body-metrics/photos/[photoId].tsx`'s screen body. Reuses
 * `usePhotoList()`'s already-cached pages to find this photo rather than a
 * dedicated `getPhoto(id)` hook - `ProgressPhotoService`/`ProgressPhotoRepository`
 * expose no single-photo read beyond `findById`(-including-deleted), which
 * this screen has no need for since a soft-deleted photo is never navigated
 * to directly (its row disappears from every list the instant it's deleted,
 * and this screen's own delete action navigates back immediately after).
 */
export function PhotoDetailScreen({ photoId }: PhotoDetailScreenProps) {
  const { files } = useContainer();
  const { data, isPending, isError, refetch } = usePhotoList();
  const deletePhoto = useDeletePhoto();
  const restorePhoto = useRestorePhoto();
  const permanentlyDeletePhoto = usePermanentlyDeletePhoto();
  const updatePhoto = useUpdatePhoto();

  const photo = useMemo(
    () => data?.pages.flat().find((entry) => entry.id === photoId),
    [data, photoId],
  );

  const [isEditing, setIsEditing] = useState(false);
  const [poseDraft, setPoseDraft] = useState<PhotoPose>('front');
  const [noteDraft, setNoteDraft] = useState('');
  const [imageFailed, setImageFailed] = useState(false);
  const [permanentDeleteConfirmVisible, setPermanentDeleteConfirmVisible] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // No mount-time effect syncing `poseDraft`/`noteDraft` from `photo` - both
  // are read only while `isEditing` is true, and `startEditing()` below
  // already seeds them fresh from `photo` the moment editing begins, so a
  // separate effect would just be a second, redundant write path
  // (`react-hooks/set-state-in-effect` correctly flags the synchronous-setState-
  // in-effect shape this would otherwise be).
  function startEditing() {
    if (!photo) return;
    setPoseDraft(photo.pose);
    setNoteDraft(photo.note ?? '');
    setIsEditing(true);
  }

  async function handleSaveEdit() {
    if (!photo) return;
    setSaveError(null);
    try {
      await updatePhoto.mutateAsync({
        id: photo.id,
        patch: { pose: poseDraft, note: noteDraft.trim() ? noteDraft.trim() : null },
      });
      setIsEditing(false);
    } catch {
      setSaveError(t('bodyMetrics.genericErrorMessage'));
    }
  }

  function handleSoftDelete() {
    if (!photo) return;
    haptics.destructive();
    deletePhoto.mutate(photo.id);
    useToastStore.getState().show({
      message: t('bodyMetrics.photoDetail.deleteUndoMessage'),
      actionLabel: t('common.undo'),
      onAction: () => restorePhoto.mutate(photo.id),
    });
    router.back();
  }

  async function handlePermanentDelete() {
    if (!photo) return;
    setPermanentDeleteConfirmVisible(false);
    await permanentlyDeletePhoto.mutateAsync(photo.id);
    router.back();
  }

  return (
    <Screen scroll testID="body-metrics-photo-detail-screen" edges={['bottom']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t('bodyMetrics.photoDetail.screenTitle'),
          headerStyle: { backgroundColor: color.background },
          headerTintColor: color.textPrimary,
          headerShadowVisible: false,
        }}
      />

      {isPending ? (
        <Column gap={4} style={{ padding: space[4] }}>
          <Skeleton width="100%" height={360} radius="lg" />
          <Skeleton width="60%" height={20} />
        </Column>
      ) : null}

      {isError ? (
        <ErrorState error={t('bodyMetrics.photos.loadErrorMessage')} onRetry={() => refetch()} />
      ) : null}

      {!isPending && !isError && !photo ? (
        <EmptyState
          illustration={
            <Ionicons name="alert-circle-outline" size={40} color={color.textTertiary} />
          }
          title={t('bodyMetrics.photoDetail.missingImageMessage')}
          testID="body-metrics-photo-detail-not-found"
        />
      ) : null}

      {photo ? (
        <Column gap={4} style={{ padding: space[4] }}>
          <View
            style={{
              width: '100%',
              aspectRatio: photo.width && photo.height ? photo.width / photo.height : 3 / 4,
              borderRadius: 16,
              overflow: 'hidden',
              backgroundColor: color.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {imageFailed ? (
              <Column gap={2} align="center">
                <Ionicons name="image-outline" size={40} color={color.textTertiary} />
                <Text variant="footnote" color="tertiary">
                  {t('bodyMetrics.photoDetail.missingImageMessage')}
                </Text>
              </Column>
            ) : (
              <Image
                source={{ uri: files.getUri(`${PROGRESS_PHOTO_DIRECTORY}/${photo.fileName}`) }}
                style={{ width: '100%', height: '100%' }}
                onError={() => setImageFailed(true)}
                accessibilityIgnoresInvertColors
                accessibilityLabel={t('bodyMetrics.photos.thumbnailAccessibilityLabelTemplate', {
                  pose: poseLabel(photo.pose),
                  date: formatBodyMetricsDate(photo.takenAt),
                })}
              />
            )}
          </View>

          <Surface level={1} radius="lg" padding={4}>
            <Column gap={3}>
              <Row justify="space-between" align="center">
                <Text variant="label" color="secondary">
                  {t('bodyMetrics.photoDetail.dateLabel')}
                </Text>
                <Text variant="bodyMedium" color="primary">
                  {formatBodyMetricsDate(photo.takenAt)}
                </Text>
              </Row>

              {isEditing ? (
                <Column gap={2}>
                  <Text variant="label" color="secondary">
                    {t('bodyMetrics.photoDetail.poseLabel')}
                  </Text>
                  <SegmentedControl
                    options={POSE_OPTIONS}
                    value={poseDraft}
                    onChange={setPoseDraft}
                  />
                </Column>
              ) : (
                <Row justify="space-between" align="center">
                  <Text variant="label" color="secondary">
                    {t('bodyMetrics.photoDetail.poseLabel')}
                  </Text>
                  <Text variant="bodyMedium" color="primary">
                    {poseLabel(photo.pose)}
                  </Text>
                </Row>
              )}

              {isEditing ? (
                <Column gap={2}>
                  <TextField
                    label={t('bodyMetrics.photoDetail.noteLabel')}
                    value={noteDraft}
                    onChangeText={setNoteDraft}
                    testID="body-metrics-photo-note-field"
                  />
                  {saveError ? (
                    <Text variant="footnote" color="danger" accessibilityLiveRegion="polite">
                      {saveError}
                    </Text>
                  ) : null}
                </Column>
              ) : (
                <Column gap={1}>
                  <Text variant="label" color="secondary">
                    {t('bodyMetrics.photoDetail.noteLabel')}
                  </Text>
                  <Text variant="body" color={photo.note ? 'primary' : 'tertiary'}>
                    {photo.note ?? t('bodyMetrics.photoDetail.noNoteMessage')}
                  </Text>
                </Column>
              )}
            </Column>
          </Surface>

          {isEditing ? (
            <Row gap={3}>
              <Button
                variant="secondary"
                label={t('common.cancel')}
                onPress={() => setIsEditing(false)}
                testID="body-metrics-photo-edit-cancel"
              />
              <Button
                variant="primary"
                label={t('bodyMetrics.photoDetail.saveButtonLabel')}
                onPress={() => void handleSaveEdit()}
                loading={updatePhoto.isPending}
                testID="body-metrics-photo-edit-save"
              />
            </Row>
          ) : (
            <Button
              variant="secondary"
              label={t('bodyMetrics.photoDetail.editButtonLabel')}
              onPress={startEditing}
              fullWidth
              testID="body-metrics-photo-edit-start"
            />
          )}

          <Button
            variant="destructive"
            label={t('bodyMetrics.photoDetail.deleteButtonLabel')}
            onPress={handleSoftDelete}
            loading={deletePhoto.isPending}
            fullWidth
            testID="body-metrics-photo-delete-button"
          />

          <Button
            variant="destructive"
            label={t('bodyMetrics.photoDetail.permanentDeleteButtonLabel')}
            onPress={() => setPermanentDeleteConfirmVisible(true)}
            loading={permanentlyDeletePhoto.isPending}
            disabled={permanentlyDeletePhoto.isPending}
            fullWidth
            testID="body-metrics-photo-permanent-delete-button"
          />
        </Column>
      ) : null}

      <ConfirmDialog
        visible={permanentDeleteConfirmVisible}
        title={t('bodyMetrics.photoDetail.permanentDeleteConfirmTitle')}
        message={t('bodyMetrics.photoDetail.permanentDeleteConfirmMessage')}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={() => void handlePermanentDelete()}
        onCancel={() => setPermanentDeleteConfirmVisible(false)}
        testID="body-metrics-photo-permanent-delete-confirm-dialog"
      />
    </Screen>
  );
}
