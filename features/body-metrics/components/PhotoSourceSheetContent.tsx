import { useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';

import { Column } from '@/components/layout';
import { ListRow, Surface, Text } from '@/components/ui';
import { t } from '@/i18n';
import { color } from '@/theme/tokens';

import { useAddPhoto } from '../hooks/usePhotos';

export interface PhotoSourceSheetContentProps {
  onAdded?: (() => void) | undefined;
}

/**
 * Rendered inside the app-root `SheetHost`/`BottomSheet` - the "add a
 * progress photo" action sheet (camera vs. library), `present()`d from
 * `PhotoGridScreen`. Owns its own `errorMessage`/`isPicking` state and calls
 * `useAddPhoto()` directly, the same "sheet content owns whatever can change
 * while it's open" shape `PlanNameSheetContent`/
 * `MeasurementQuickEntrySheetContent` already establish. Permission
 * requests and `launchCameraAsync`/`launchImageLibraryAsync` calls mirror
 * `OnboardingScreen.handlePickAvatar`'s exact pattern (the only other
 * `expo-image-picker` call site in this codebase) - denial or a failed pick
 * both leave the sheet open with an inline message, never a crash.
 *
 * On success, the sheet is left open just long enough to show nothing wrong
 * happened, then it's the caller's job (`onAdded`) to dismiss and navigate -
 * kept here rather than self-dismissing so `PhotoGridScreen` can decide
 * whether to route straight into the new photo's detail or just close back
 * to the grid (documented at that call site).
 */
export function PhotoSourceSheetContent({ onAdded }: PhotoSourceSheetContentProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const addPhoto = useAddPhoto();

  async function handlePick(source: 'camera' | 'library') {
    setErrorMessage(null);
    setIsPicking(true);
    try {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setErrorMessage(t('bodyMetrics.photoSource.permissionDeniedMessage'));
        return;
      }

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });

      if (result.canceled) {
        return;
      }
      const asset = result.assets[0];
      if (!asset) {
        return;
      }

      await addPhoto.mutateAsync({ sourceUri: asset.uri });
      onAdded?.();
    } catch {
      setErrorMessage(t('bodyMetrics.photoSource.pickFailedMessage'));
    } finally {
      setIsPicking(false);
    }
  }

  return (
    <Column gap={4}>
      <Text variant="title3" color="primary">
        {t('bodyMetrics.photoSource.title')}
      </Text>
      {errorMessage ? (
        <Text variant="footnote" color="danger" accessibilityLiveRegion="polite">
          {errorMessage}
        </Text>
      ) : null}
      <Surface level={1} radius="lg">
        <ListRow
          title={t('bodyMetrics.photoSource.cameraLabel')}
          leading={<Ionicons name="camera-outline" size={22} color={color.textSecondary} />}
          onPress={() => void handlePick('camera')}
          disabled={isPicking || addPhoto.isPending}
          busy={isPicking || addPhoto.isPending}
          testID="photo-source-camera-row"
        />
        <ListRow
          title={t('bodyMetrics.photoSource.libraryLabel')}
          leading={<Ionicons name="images-outline" size={22} color={color.textSecondary} />}
          onPress={() => void handlePick('library')}
          disabled={isPicking || addPhoto.isPending}
          busy={isPicking || addPhoto.isPending}
          testID="photo-source-library-row"
        />
      </Surface>
    </Column>
  );
}
