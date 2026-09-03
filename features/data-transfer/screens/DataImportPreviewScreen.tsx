import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import * as Sharing from 'expo-sharing';
import { router } from 'expo-router';

import { Column, Row, Screen } from '@/components/layout';
import { Button, SegmentedControl, Surface, Text } from '@/components/ui';
import { ErrorState, Skeleton } from '@/components/feedback';
import { t, type TranslationKey } from '@/i18n';
import { routes } from '@/navigation/routes';
import { useDataTransferImportStore } from '@/stores/dataTransferImportStore';
import { useToastStore } from '@/stores/toastStore';
import { space } from '@/theme/tokens';

import { TypedConfirmationGate } from '../components/TypedConfirmationGate';
import {
  useImportCsv,
  useImportJson,
  usePreviewImportCsv,
  usePreviewImportJson,
} from '../hooks/useDataTransfer';
import type { ImportEntityCounts, ImportPreview, ImportResult } from '../types/ImportTypes';

const REPLACE_CONFIRM_PHRASE = 'REPLACE';

type ImportMode = 'merge' | 'replace';

const ENTITY_ROWS: readonly {
  key: keyof Omit<ImportPreview, 'warnings'>;
  labelKey: TranslationKey;
}[] = [
  { key: 'profile', labelKey: 'dataTransfer.entities.profile' },
  { key: 'settings', labelKey: 'dataTransfer.entities.settings' },
  { key: 'customExercises', labelKey: 'dataTransfer.entities.customExercises' },
  { key: 'exerciseUserData', labelKey: 'dataTransfer.entities.exerciseUserData' },
  { key: 'exerciseVideos', labelKey: 'dataTransfer.entities.exerciseVideos' },
  { key: 'plans', labelKey: 'dataTransfer.entities.plans' },
  { key: 'sessions', labelKey: 'dataTransfer.entities.sessions' },
  { key: 'bodyMetrics', labelKey: 'dataTransfer.entities.bodyMetrics' },
  { key: 'progressPhotos', labelKey: 'dataTransfer.entities.progressPhotos' },
];

/**
 * `app/profile/settings/import-preview.tsx`'s screen body - ADR-0013's
 * "shows exactly what will be created and which rows could not be resolved,
 * before anything is written," plus (JSON only) the merge/replace mode
 * choice and replace mode's typed-confirmation seatbelt
 * ({@link TypedConfirmationGate}).
 *
 * Reads its file content from `dataTransferImportStore` (never a route
 * param - see that store's own doc comment) and, on mount, immediately runs
 * a zero-write preview (`usePreviewImportJson`/`usePreviewImportCsv`
 * depending on which action `DataImportScreen` used to get here). A missing
 * `request` (a stale deep link, or this screen reached with the store
 * already cleared) renders an explanatory `ErrorState` pointing back at
 * `DataImportScreen` rather than crashing on a `null` dereference.
 *
 * Three local phases, tracked as plain component state rather than a
 * separate route each (this phase's own brief lists "Import screen" and
 * "Import preview screen" as the two screens; the result is a state
 * transition *within* the preview screen, the same "toggle a mode in place"
 * shape `WorkoutHistoryDetailScreen`'s edit/read-only toggle already uses
 * rather than a third screen): previewing -> ready-to-import (counts,
 * warnings, mode choice) -> imported (the {@link ImportResult}, including
 * the pre-replace backup path when present).
 */
export function DataImportPreviewScreen() {
  const request = useDataTransferImportStore((state) => state.request);
  const clearRequest = useDataTransferImportStore((state) => state.clear);

  const previewJson = usePreviewImportJson();
  const previewCsv = usePreviewImportCsv();
  const importJson = useImportJson();
  const importCsv = useImportCsv();

  const [mode, setMode] = useState<ImportMode>('merge');
  const hasStartedPreview = useRef(false);

  const isJson = request?.format === 'json';
  const preview = isJson ? previewJson.data : previewCsv.data;
  const isPreviewPending = isJson ? previewJson.isPending : previewCsv.isPending;
  const isPreviewError = isJson ? previewJson.isError : previewCsv.isError;
  const importMutation = isJson ? importJson : importCsv;
  const result: ImportResult | undefined = importMutation.data;

  useEffect(() => {
    if (!request || hasStartedPreview.current) {
      return;
    }
    hasStartedPreview.current = true;
    if (request.format === 'json') {
      previewJson.mutate(request.fileContent);
    } else {
      previewCsv.mutate(request.fileContent);
    }
    // Intentionally run once per mount, keyed by `request` existing at all -
    // `previewJson`/`previewCsv` are stable mutation objects this codebase's
    // other mutation-triggering effects (e.g. `SettingsScreen`'s rebuild
    // announcement) also omit from their own dependency arrays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  useEffect(() => {
    if (isPreviewPending) {
      AccessibilityInfo.announceForAccessibility(t('common.loading'));
    }
  }, [isPreviewPending]);

  useEffect(() => {
    if (result) {
      AccessibilityInfo.announceForAccessibility(t('dataTransfer.import.resultAnnouncement'));
    }
  }, [result]);

  function handleDone() {
    clearRequest();
    router.replace(routes.profileSettings.index());
  }

  async function handleShareBackup(backupFilePath: string) {
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        useToastStore
          .getState()
          .show({ message: t('dataTransfer.export.shareUnavailableMessage') });
        return;
      }
      await Sharing.shareAsync(backupFilePath, {
        dialogTitle: t('dataTransfer.import.backupShareDialogTitle'),
      });
    } catch {
      useToastStore.getState().show({ message: t('dataTransfer.export.shareUnavailableMessage') });
    }
  }

  async function handleImportMerge() {
    if (!request) return;
    try {
      if (request.format === 'json') {
        await importJson.mutateAsync({ fileContent: request.fileContent, mode: 'merge' });
      } else {
        await importCsv.mutateAsync(request.fileContent);
      }
    } catch {
      useToastStore.getState().show({ message: t('dataTransfer.import.importErrorMessage') });
    }
  }

  async function handleImportReplace() {
    if (!request) return;
    try {
      await importJson.mutateAsync({
        fileContent: request.fileContent,
        mode: 'replace',
        confirmed: true,
      });
    } catch {
      useToastStore.getState().show({ message: t('dataTransfer.import.importErrorMessage') });
    }
  }

  if (!request) {
    return (
      <Screen scroll edges={['bottom']} testID="data-import-preview-screen">
        <Column gap={4} style={{ paddingVertical: space[6] }}>
          <ErrorState error={t('dataTransfer.import.noRequestMessage')} />
          <Button
            variant="secondary"
            label={t('dataTransfer.import.backToImportButtonLabel')}
            onPress={() => router.replace(routes.profileSettings.dataImport())}
            fullWidth
          />
        </Column>
      </Screen>
    );
  }

  return (
    <Screen scroll edges={['bottom']} testID="data-import-preview-screen">
      <Column gap={6} style={{ paddingVertical: space[6] }}>
        <Column gap={1}>
          <Text variant="title2" color="primary">
            {t('dataTransfer.import.previewTitle')}
          </Text>
          <Text variant="footnote" color="secondary" numberOfLines={1}>
            {request.fileName}
          </Text>
        </Column>

        {result ? (
          <ImportResultSummary
            result={result}
            onShareBackup={(path) => void handleShareBackup(path)}
            onDone={handleDone}
          />
        ) : isPreviewPending ? (
          <PreviewSkeleton />
        ) : isPreviewError || !preview ? (
          <ErrorState error={t('dataTransfer.import.previewErrorMessage')} />
        ) : (
          <Column gap={6}>
            <ImportPreviewCounts preview={preview} />

            {request.format === 'json' ? (
              <Column gap={3}>
                <Text variant="label" color="secondary">
                  {t('dataTransfer.import.modeSectionTitle')}
                </Text>
                <SegmentedControl
                  options={[
                    { value: 'merge' as const, label: t('dataTransfer.import.modeMergeLabel') },
                    { value: 'replace' as const, label: t('dataTransfer.import.modeReplaceLabel') },
                  ]}
                  value={mode}
                  onChange={setMode}
                  testID="data-import-mode-segmented-control"
                />
                <Text variant="footnote" color="tertiary">
                  {mode === 'merge'
                    ? t('dataTransfer.import.modeMergeDescription')
                    : t('dataTransfer.import.modeReplaceDescription')}
                </Text>
              </Column>
            ) : null}

            {request.format === 'json' && mode === 'replace' ? (
              <TypedConfirmationGate
                requiredPhrase={REPLACE_CONFIRM_PHRASE}
                instructionLabel={t('dataTransfer.import.replaceConfirmInstruction')}
                confirmButtonLabel={t('dataTransfer.import.replaceConfirmButtonLabel')}
                onConfirm={() => void handleImportReplace()}
                loading={importJson.isPending}
                testID="data-import-replace-confirm"
              />
            ) : (
              <Button
                variant="primary"
                label={t('dataTransfer.import.importButtonLabel')}
                onPress={() => void handleImportMerge()}
                loading={importMutation.isPending}
                disabled={importMutation.isPending}
                fullWidth
                testID="data-import-confirm-button"
              />
            )}
          </Column>
        )}
      </Column>
    </Screen>
  );
}

function ImportPreviewCounts({ preview }: { preview: ImportPreview }) {
  return (
    <Column gap={4}>
      <Surface level={1} radius="lg">
        {ENTITY_ROWS.map(({ key, labelKey }) => (
          <EntityCountRow key={key} label={t(labelKey)} counts={preview[key]} />
        ))}
      </Surface>

      {preview.warnings.length > 0 ? (
        <Column gap={2}>
          <Text variant="label" color="secondary">
            {t('dataTransfer.import.warningsSectionTitle')}
          </Text>
          <Surface level={1} radius="lg" padding={4}>
            <Column gap={2}>
              {preview.warnings.map((warning, index) => (
                <Text key={`${warning.entity}-${index}`} variant="footnote" color="tertiary">
                  {`• ${warning.message}`}
                </Text>
              ))}
            </Column>
          </Surface>
        </Column>
      ) : null}
    </Column>
  );
}

function EntityCountRow({ label, counts }: { label: string; counts: ImportEntityCounts }) {
  return (
    <Row
      justify="space-between"
      align="center"
      style={{ paddingVertical: space[3], paddingHorizontal: space[4] }}
    >
      <Text variant="body" color="primary">
        {label}
      </Text>
      <Text variant="footnote" color="secondary">
        {t('dataTransfer.import.entityCountsTemplate', {
          toCreate: counts.toCreate,
          toUpdate: counts.toUpdate,
          unchanged: counts.unchanged,
        })}
      </Text>
    </Row>
  );
}

function ImportResultSummary({
  result,
  onShareBackup,
  onDone,
}: {
  result: ImportResult;
  onShareBackup: (path: string) => void;
  onDone: () => void;
}) {
  const { backupFilePath } = result;
  return (
    <Column gap={6}>
      <Surface level={1} radius="lg" padding={4}>
        <Column gap={2}>
          <Text variant="title3" color="primary">
            {t('dataTransfer.import.resultTitle')}
          </Text>
          <Text variant="body" color="secondary">
            {t('dataTransfer.import.resultSummaryTemplate', {
              sessions: result.written.sessions,
              sets: result.written.sets,
              plans: result.written.plans,
            })}
          </Text>
        </Column>
      </Surface>

      {backupFilePath ? (
        <Surface level={1} radius="lg" padding={4}>
          <Column gap={3}>
            <Text variant="body" color="primary">
              {t('dataTransfer.import.backupCreatedMessage')}
            </Text>
            <Text variant="footnote" color="tertiary" numberOfLines={2}>
              {backupFilePath}
            </Text>
            <Button
              variant="secondary"
              label={t('dataTransfer.import.shareBackupButtonLabel')}
              onPress={() => onShareBackup(backupFilePath)}
              fullWidth
              testID="data-import-share-backup-button"
            />
          </Column>
        </Surface>
      ) : null}

      {result.warnings.length > 0 ? (
        <Column gap={2}>
          <Text variant="label" color="secondary">
            {t('dataTransfer.import.warningsSectionTitle')}
          </Text>
          <Surface level={1} radius="lg" padding={4}>
            <Column gap={2}>
              {result.warnings.map((warning, index) => (
                <Text key={`${warning.entity}-${index}`} variant="footnote" color="tertiary">
                  {`• ${warning.message}`}
                </Text>
              ))}
            </Column>
          </Surface>
        </Column>
      ) : null}

      <Button
        variant="primary"
        label={t('common.done')}
        onPress={onDone}
        fullWidth
        testID="data-import-done-button"
      />
    </Column>
  );
}

function PreviewSkeleton() {
  return (
    <Column gap={4}>
      <Skeleton width="100%" height={280} radius="lg" />
      <Skeleton width="100%" height={48} radius="md" />
    </Column>
  );
}
