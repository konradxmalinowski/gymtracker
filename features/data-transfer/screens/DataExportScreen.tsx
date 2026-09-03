import { useState } from 'react';
import * as Sharing from 'expo-sharing';

import { Column, Row, Screen } from '@/components/layout';
import { Button, Surface, Text } from '@/components/ui';
import { t } from '@/i18n';
import { useContainer } from '@/services/container';
import { useToastStore } from '@/stores/toastStore';
import { space } from '@/theme/tokens';

import { useExportBackup, useExportCsv } from '../hooks/useDataTransfer';

/**
 * `app/profile/settings/export.tsx`'s screen body. ADR-0013: two distinct
 * actions - "Create backup (JSON)" and "Export workout log (CSV)" - never a
 * format dropdown, "because the format choice is really a purpose choice."
 * Each action's own lossiness/exclusion facts are stated directly under its
 * button, not only in this codebase's docs (ADR-0013's own "Negative
 * consequences": "CSV's lossiness must be communicated in the UI rather
 * than assumed obvious").
 *
 * "Share progress photos" is a third, separate action (roadmap P14
 * acceptance: "'Share progress photos' as a separate action") - see
 * {@link handleSharePhotos}'s own doc comment for why it shares each photo
 * through its own share-sheet call rather than a single bulk share: no
 * bulk/zip photo-export primitive exists anywhere in `body-metrics`
 * (confirmed by reading `ProgressPhotoService.ts`/its repository interface
 * in full - `listPhotos`/`verifyIntegrity` are the entire read surface, no
 * archive/export method), and building one is real, independent feature
 * work (its own domain logic, its own fixtures) rather than something this
 * phase's own scope covers - this action is built entirely from primitives
 * that already exist (`progressPhotoService.listPhotos()`, `files.getUri()`,
 * `expo-sharing`), not new export logic.
 */
export function DataExportScreen() {
  const { progressPhotoService, files } = useContainer();
  const exportBackup = useExportBackup();
  const exportCsv = useExportCsv();
  const [isSharingPhotos, setIsSharingPhotos] = useState(false);

  async function shareFile(filePath: string, dialogTitle: string, unavailableMessage: string) {
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      // Same "degrade to a no-op, never fail the flow" discipline
      // `WorkoutSummaryScreen.handleShare`/`RestTimerNotificationService`
      // already established for this native capability - the export itself
      // already succeeded and the file is safely on disk either way.
      useToastStore.getState().show({ message: unavailableMessage });
      return;
    }
    await Sharing.shareAsync(filePath, { dialogTitle });
  }

  async function handleCreateBackup() {
    try {
      const result = await exportBackup.mutateAsync();
      await shareFile(
        result.filePath,
        t('dataTransfer.export.jsonShareDialogTitle'),
        t('dataTransfer.export.shareUnavailableMessage'),
      );
    } catch {
      useToastStore.getState().show({ message: t('dataTransfer.export.jsonErrorMessage') });
    }
  }

  async function handleExportCsv() {
    try {
      const result = await exportCsv.mutateAsync();
      await shareFile(
        result.filePath,
        t('dataTransfer.export.csvShareDialogTitle'),
        t('dataTransfer.export.shareUnavailableMessage'),
      );
    } catch {
      useToastStore.getState().show({ message: t('dataTransfer.export.csvErrorMessage') });
    }
  }

  /**
   * Shares every current (non-deleted) progress photo's full-size image,
   * one `Sharing.shareAsync` call at a time, awaiting each share sheet's
   * dismissal before opening the next - see this screen's own header
   * comment for why this loops rather than building a bulk/zip share. Zero
   * photos shows an explanatory toast rather than a silent no-op button
   * press, matching every other "nothing to do" case this codebase
   * surfaces via `useToastStore` (e.g. `WorkoutSummaryScreen`'s share
   * button when the capture target isn't ready yet).
   */
  async function handleSharePhotos() {
    setIsSharingPhotos(true);
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        useToastStore
          .getState()
          .show({ message: t('dataTransfer.export.shareUnavailableMessage') });
        return;
      }
      const photos = await progressPhotoService.listPhotos();
      if (photos.length === 0) {
        useToastStore.getState().show({ message: t('dataTransfer.export.noPhotosMessage') });
        return;
      }
      // Sequential, not `Promise.all` - only one native share sheet can be
      // on screen at a time, and firing every `shareAsync` call at once
      // would race them against the same OS-level share UI.
      for (const photo of photos) {
        await Sharing.shareAsync(files.getUri(`progress-photos/${photo.fileName}`), {
          dialogTitle: t('dataTransfer.export.photosShareDialogTitle'),
        });
      }
    } catch {
      useToastStore.getState().show({ message: t('dataTransfer.export.photosErrorMessage') });
    } finally {
      setIsSharingPhotos(false);
    }
  }

  return (
    <Screen scroll edges={['bottom']} testID="data-export-screen">
      <Column gap={6} style={{ paddingVertical: space[6] }}>
        <Surface level={1} radius="lg" padding={4}>
          <Column gap={3}>
            <Text variant="title3" color="primary">
              {t('dataTransfer.export.jsonTitle')}
            </Text>
            <Text variant="body" color="secondary">
              {t('dataTransfer.export.jsonDescription')}
            </Text>
            <Text variant="footnote" color="tertiary">
              {t('dataTransfer.export.jsonExclusionNote')}
            </Text>
            <Button
              variant="primary"
              label={t('dataTransfer.export.jsonButtonLabel')}
              onPress={() => void handleCreateBackup()}
              loading={exportBackup.isPending}
              disabled={exportBackup.isPending}
              fullWidth
              testID="data-export-json-button"
            />
          </Column>
        </Surface>

        <Surface level={1} radius="lg" padding={4}>
          <Column gap={3}>
            <Text variant="title3" color="primary">
              {t('dataTransfer.export.csvTitle')}
            </Text>
            <Text variant="body" color="secondary">
              {t('dataTransfer.export.csvDescription')}
            </Text>
            <Text variant="footnote" color="tertiary">
              {t('dataTransfer.export.csvExclusionNote')}
            </Text>
            <Button
              variant="secondary"
              label={t('dataTransfer.export.csvButtonLabel')}
              onPress={() => void handleExportCsv()}
              loading={exportCsv.isPending}
              disabled={exportCsv.isPending}
              fullWidth
              testID="data-export-csv-button"
            />
          </Column>
        </Surface>

        <Surface level={1} radius="lg" padding={4}>
          <Column gap={3}>
            <Row justify="space-between" align="center">
              <Text variant="title3" color="primary">
                {t('dataTransfer.export.photosTitle')}
              </Text>
            </Row>
            <Text variant="body" color="secondary">
              {t('dataTransfer.export.photosDescription')}
            </Text>
            <Button
              variant="secondary"
              label={t('dataTransfer.export.photosButtonLabel')}
              onPress={() => void handleSharePhotos()}
              loading={isSharingPhotos}
              disabled={isSharingPhotos}
              fullWidth
              testID="data-export-photos-button"
            />
          </Column>
        </Surface>
      </Column>
    </Screen>
  );
}
