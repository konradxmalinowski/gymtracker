import { useState } from 'react';

import { Column } from '@/components/layout';
import { Button, Text, TextField } from '@/components/ui';
import { t } from '@/i18n';
import { space } from '@/theme/tokens';

export interface WorkoutNotesSheetContentProps {
  /** `ActiveSessionAggregate.notes` at the moment the sheet was opened. */
  initialNotes: string | null;
  /** Trimmed-to-`null`-if-empty, matching the pre-migration inline sheet's behavior. Does not itself dismiss the sheet - the presenter wires that in (see `WorkoutHeader.openNotesSheet`), same split `SetTypePickerSheetContent.onSelect` uses. */
  onSave: (notes: string | null) => void;
  testID?: string | undefined;
}

/**
 * Presented via `sheetStore` from `WorkoutHeader` (tapping the notes icon) -
 * see that file's `openNotesSheet`. Migrated off a local inline `<BottomSheet>`
 * embed for the same reason `SetTypePickerSheetContent`/
 * `PlateCalculatorSheetContent` already are (CLAUDE.md's Post-P12 bugfix
 * pass): a `<BottomSheet>` mounted as a sibling somewhere other than the app
 * root only positions correctly relative to the real screen bounds, which an
 * `ActiveWorkoutScreen`-nested instance is not.
 *
 * Keeps its own draft state (uncontrolled from `WorkoutHeader`'s
 * perspective) since `content` is captured once at `present()` time and does
 * not itself re-render when `WorkoutHeader` does.
 */
export function WorkoutNotesSheetContent({
  initialNotes,
  onSave,
  testID,
}: WorkoutNotesSheetContentProps) {
  const [notesDraft, setNotesDraft] = useState(initialNotes ?? '');

  function handleSave() {
    onSave(notesDraft.trim() === '' ? null : notesDraft);
  }

  return (
    <Column gap={4} style={{ paddingTop: space[2] }}>
      <Text variant="title3" color="primary">
        {t('workoutLogging.header.notesSheetTitle')}
      </Text>
      <TextField
        label={t('workoutLogging.header.notesFieldLabel')}
        value={notesDraft}
        onChangeText={setNotesDraft}
        placeholder={t('workoutLogging.header.notesPlaceholder')}
        testID={testID ? `${testID}-field` : undefined}
      />
      <Button
        variant="primary"
        label={t('common.save')}
        onPress={handleSave}
        fullWidth
        testID={testID ? `${testID}-save` : undefined}
      />
    </Column>
  );
}
