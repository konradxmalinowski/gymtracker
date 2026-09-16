import { Column, Row } from '@/components/layout';
import { Chip, Text } from '@/components/ui';
import type { SetType } from '@/features/workout-logging';
import { t } from '@/i18n';

import { PICKABLE_SET_TYPES, setTypeLabel } from './setTypeDisplay';

export interface SetTypePickerSheetContentProps {
  currentType: SetType;
  onSelect: (type: SetType) => void;
  testID?: string | undefined;
}

/**
 * Presented via `sheetStore` from `SetRow` (tapping the set-type badge) -
 * see that file's `openTypePicker`. Picking a type both commits it and
 * dismisses the sheet in one tap, since there is nothing else to configure
 * here; unlike `ExerciseFilterSheetContent` this needs no live reactivity to
 * a shared store while open, so it takes `currentType`/`onSelect` as plain
 * props captured at `present()` time.
 *
 * Item 4 fix: this used to be an inline `Row wrap` of `Chip`s inside
 * `SetRow`'s own expanding section, which pushed every row below it down the
 * screen on every tap. Moving it into the existing bottom-sheet overlay
 * keeps `SetRow`'s own height fixed regardless of whether the picker is
 * open.
 */
export function SetTypePickerSheetContent({
  currentType,
  onSelect,
  testID,
}: SetTypePickerSheetContentProps) {
  return (
    <Column gap={4}>
      <Text variant="title3" color="primary" accessibilityRole="header">
        {t('workoutLogging.set.typePickerTitle')}
      </Text>
      <Row gap={2} wrap>
        {PICKABLE_SET_TYPES.map((type) => (
          <Chip
            key={type}
            label={setTypeLabel(type)}
            selected={currentType === type}
            onPress={() => onSelect(type)}
            testID={testID ? `${testID}-${type}` : undefined}
          />
        ))}
      </Row>
    </Column>
  );
}
