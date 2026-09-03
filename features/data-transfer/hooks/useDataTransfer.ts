import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useContainer } from '@/services/container';
import type { ImportResult } from '../types/ImportTypes';

/**
 * TanStack Query wrappers over `DataTransferService` for the export/import
 * screens (`features/data-transfer/screens/*`). Calls `useContainer()`
 * directly rather than taking the service as a parameter - matching
 * `features/body-metrics/hooks/useBodyMetrics.ts`'s actual shape, not the
 * `records`/`workout-logging` "service as a parameter" pattern those two
 * features' hooks use. That parameter-injection pattern exists specifically
 * to dodge an `import/no-cycle` a *barrel-exported* hook would otherwise hit
 * (a hook importing `useContainer()` -> `services/container.ts` ->
 * `@/features/x` barrel -> this same hook file, if the hook were
 * re-exported through the barrel `container.ts` also imports from). Per this
 * feature's own barrel (`features/data-transfer/index.ts`), these hooks are
 * never re-exported - the same "no cross-feature consumer" reasoning
 * `body-metrics`' barrel already gives for leaving its own hooks out - so
 * that cycle cannot occur here, and `useContainer()` inside the hook is the
 * simpler, precedented shape for a feature in that position.
 */

/** ADR-0013 "Create backup (JSON)". */
export function useExportBackup() {
  const { dataTransferService } = useContainer();

  return useMutation({
    mutationFn: () => dataTransferService.exportBackup(),
  });
}

/** ADR-0013 "Export workout log (CSV)". */
export function useExportCsv() {
  const { dataTransferService } = useContainer();

  return useMutation({
    mutationFn: () => dataTransferService.exportCsv(),
  });
}

/** Zero-write dry run over a picked JSON backup file's already-read text content. */
export function usePreviewImportJson() {
  const { dataTransferService } = useContainer();

  return useMutation({
    mutationFn: (fileContent: string) => dataTransferService.previewImportJson(fileContent),
  });
}

/** Zero-write dry run over a picked CSV export file's already-read text content. */
export function usePreviewImportCsv() {
  const { dataTransferService } = useContainer();

  return useMutation({
    mutationFn: (fileContent: string) => dataTransferService.previewImportCsv(fileContent),
  });
}

export interface ImportJsonVariables {
  fileContent: string;
  mode: 'merge' | 'replace';
  /** Required (and must be `true`) for `mode: 'replace'` - `DataImportPreviewScreen`'s typed-confirmation gate is what sets this, never a bare tap. Omitted entirely for `mode: 'merge'`, matching `DataTransferService.importJson`'s own optional-options shape. */
  confirmed?: boolean;
}

/**
 * ADR-0013 "Import modes" (JSON). See this file's own header comment for why
 * `onSuccess` - not `DataTransferService.importJson` itself - is what
 * clears the query cache: ADR-0013 says "the entire query cache is
 * cleared" as the last step of the post-import rebuild sequence, but
 * `DataTransferService`'s own `runPostImportRebuild` (see its doc comment)
 * only ever calls `recordService.rebuild()`/`progressPhotoService
 * .verifyIntegrity()` - a service has no `QueryClient` to clear, since
 * TanStack Query is a presentation-layer concern this codebase's service
 * layer never imports (confirmed by reading `DataTransferService.ts` in
 * full - no `@tanstack/react-query` import anywhere in it). This hook is
 * therefore where that last step of the sequence actually happens: every
 * screen that reads through `useContainer()`'s other services (Home,
 * Stats, the exercise library, etc.) would otherwise keep rendering
 * pre-import data until its own query happened to refetch on some other
 * trigger, which is exactly the staleness ADR-0013's instruction exists to
 * prevent.
 */
export function useImportJson() {
  const { dataTransferService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation<ImportResult, Error, ImportJsonVariables>({
    mutationFn: ({ fileContent, mode, confirmed }) =>
      dataTransferService.importJson(
        fileContent,
        mode,
        confirmed !== undefined ? { confirmed } : undefined,
      ),
    onSuccess: () => {
      queryClient.clear();
    },
  });
}

/** ADR-0013 "CSV import" - always merge-shaped. Same post-success cache clear as {@link useImportJson}, for the same reason. */
export function useImportCsv() {
  const { dataTransferService } = useContainer();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fileContent: string) => dataTransferService.importCsv(fileContent),
    onSuccess: () => {
      queryClient.clear();
    },
  });
}
