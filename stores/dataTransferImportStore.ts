import { create } from 'zustand';

/**
 * Ephemeral UI flow state only (CLAUDE.md's Zustand scope) - carries a
 * picked-but-not-yet-previewed import file's full text content from
 * `DataImportScreen` (`app/profile/settings/import.tsx`) to
 * `DataImportPreviewScreen` (`app/profile/settings/import-preview.tsx`).
 *
 * Same reasoning `stores/exercisePickerStore.ts` already documents for its
 * own "why a store, not route params" choice, applied here to an even
 * larger payload: a JSON backup's `fileContent` can run tens of megabytes
 * (ADR-0013's own "Negative consequences" section, ~30-40MB at the
 * 78,000-set worst case) - Expo Router serializes route params into the
 * URL, so round-tripping that much text through a query string is not an
 * option at all, not merely wasteful the way it would be for
 * `exercisePickerStore`'s bounded id list. A root-level store scoped to
 * exactly this "pick a file, then preview it" flow (cleared on both ends,
 * never left holding a stale request) is the same shape.
 *
 * Lives at the project root rather than inside `features/data-transfer`
 * for consistency with `exercisePickerStore`'s own placement, even though
 * `data-transfer` has no cross-feature ownership conflict to avoid here (it
 * is the only feature that ever reads or writes this store) - keeping every
 * "screen A hands screen B an unbounded payload" store in one place (`stores/`)
 * rather than splitting the pattern across two locations was judged the
 * more consistent choice.
 */
export type DataTransferImportFormat = 'json' | 'csv';

export interface DataTransferImportRequest {
  fileContent: string;
  /** The picked document's display name (e.g. `gymtracker-backup-...json`) - shown on the preview screen so the user can confirm they picked the right file. */
  fileName: string;
  format: DataTransferImportFormat;
}

interface DataTransferImportState {
  request: DataTransferImportRequest | null;
  setRequest: (request: DataTransferImportRequest) => void;
  clear: () => void;
}

export const useDataTransferImportStore = create<DataTransferImportState>((set) => ({
  request: null,
  setRequest: (request) => set({ request }),
  clear: () => set({ request: null }),
}));
