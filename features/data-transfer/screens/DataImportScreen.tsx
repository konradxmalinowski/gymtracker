import { useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';

import { Column, Screen } from '@/components/layout';
import { Button, Surface, Text } from '@/components/ui';
import { t } from '@/i18n';
import { routes } from '@/navigation/routes';
import { useContainer } from '@/services/container';
import { useDataTransferImportStore } from '@/stores/dataTransferImportStore';
import { useToastStore } from '@/stores/toastStore';
import { space } from '@/theme/tokens';

/** Relative directory (under the container's `'document'`-scoped `FileStorage`) a picked file's content is briefly copied into before being read back as text - never a durable location, always deleted right after the read, mirroring `DataTransferService`'s own `.tmp-*` write-then-delete shape for a different direction (write vs. read) of the same "copy in, read/write, clean up" pattern. */
const IMPORT_STAGING_DIRECTORY = 'imports';

/**
 * `app/profile/settings/import.tsx`'s screen body. Two distinct pick
 * actions - "Restore from backup (JSON)" / "Import workout log (CSV)" -
 * mirroring `DataExportScreen`'s own "purpose choice, not a format
 * dropdown" shape (ADR-0013). Picking a file reads its full text content
 * (via `FileStorage.copyFrom` + `readText`, the same primitive
 * `ProfileService`/`ProgressPhotoService` already use for a picker-result
 * URI outside app storage) and hands it to `DataImportPreviewScreen`
 * through `dataTransferImportStore` - see that store's own doc comment for
 * why a store, not a route param, carries a file that can run tens of
 * megabytes.
 */
export function DataImportScreen() {
  const { files } = useContainer();
  const setRequest = useDataTransferImportStore((state) => state.setRequest);
  const [isPickingJson, setIsPickingJson] = useState(false);
  const [isPickingCsv, setIsPickingCsv] = useState(false);

  async function readPickedDocumentText(
    asset: DocumentPicker.DocumentPickerAsset,
  ): Promise<string> {
    const stagingPath = `${IMPORT_STAGING_DIRECTORY}/.tmp-import-${Date.now()}-${asset.name}`;
    try {
      await files.copyFrom(asset.uri, stagingPath);
      const content = await files.readText(stagingPath);
      if (content === null) {
        throw new Error(`Copied import file produced no readable content at "${stagingPath}".`);
      }
      return content;
    } finally {
      await files.delete(stagingPath);
    }
  }

  async function handlePick(
    format: 'json' | 'csv',
    mimeTypes: string[],
    setPicking: (value: boolean) => void,
  ) {
    setPicking(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: mimeTypes,
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || result.assets.length === 0) {
        return;
      }
      const asset = result.assets[0]!;
      const content = await readPickedDocumentText(asset);
      setRequest({ fileContent: content, fileName: asset.name, format });
      router.push(routes.profileSettings.dataImportPreview());
    } catch {
      useToastStore.getState().show({ message: t('dataTransfer.import.pickErrorMessage') });
    } finally {
      setPicking(false);
    }
  }

  return (
    <Screen scroll edges={['bottom']} testID="data-import-screen">
      <Column gap={6} style={{ paddingVertical: space[6] }}>
        <Surface level={1} radius="lg" padding={4}>
          <Column gap={3}>
            <Text variant="title3" color="primary">
              {t('dataTransfer.import.jsonTitle')}
            </Text>
            <Text variant="body" color="secondary">
              {t('dataTransfer.import.jsonDescription')}
            </Text>
            <Button
              variant="primary"
              label={t('dataTransfer.import.jsonButtonLabel')}
              onPress={() => void handlePick('json', ['application/json'], setIsPickingJson)}
              loading={isPickingJson}
              disabled={isPickingJson || isPickingCsv}
              fullWidth
              testID="data-import-json-button"
            />
          </Column>
        </Surface>

        <Surface level={1} radius="lg" padding={4}>
          <Column gap={3}>
            <Text variant="title3" color="primary">
              {t('dataTransfer.import.csvTitle')}
            </Text>
            <Text variant="body" color="secondary">
              {t('dataTransfer.import.csvDescription')}
            </Text>
            <Button
              variant="secondary"
              label={t('dataTransfer.import.csvButtonLabel')}
              onPress={() =>
                void handlePick(
                  'csv',
                  ['text/csv', 'text/comma-separated-values', 'text/plain'],
                  setIsPickingCsv,
                )
              }
              loading={isPickingCsv}
              disabled={isPickingJson || isPickingCsv}
              fullWidth
              testID="data-import-csv-button"
            />
          </Column>
        </Surface>
      </Column>
    </Screen>
  );
}
