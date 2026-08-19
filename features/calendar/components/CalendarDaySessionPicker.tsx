import { View } from 'react-native';
import { router } from 'expo-router';

import { Column, Row } from '@/components/layout';
import { ListRow, Text } from '@/components/ui';
import { t } from '@/i18n';
import { routes } from '@/navigation/routes';
import { useSheetStore } from '@/stores/sheetStore';
import type { EntityId } from '@/repositories/contracts/repository';
import { space } from '@/theme/tokens';

import { parseLocalDate } from '../domain/localDate';

export interface CalendarDaySessionPickerProps {
  localDate: string;
  sessionIds: readonly EntityId[];
  planDayNames: readonly (string | null)[];
  testID?: string | undefined;
}

/**
 * Rendered inside the app-root `SheetHost`/`BottomSheet` (`present()`d from
 * `CalendarScreen` when a day cell holds more than one completed session -
 * the rare same-day AM/PM training case `CalendarRepository.ts`'s own
 * `CalendarDayDto` doc comment names, Step 0 decision 5). Mirrors
 * `ExerciseFilterSheetContent`'s "sheet content is its own component,
 * `present()`d with JSX built at call time" shape - unlike that sheet,
 * this one's data is fixed for its lifetime (the day already tapped), so it
 * takes plain props instead of reading a store.
 *
 * Each row navigates straight to `history.detail(sessionId)`
 * (`WorkoutHistoryListScreen`'s own `HistoryRow` precedent) and dismisses
 * the sheet first - the row style mirrors `PersonalRecordsScreen`'s/
 * `WorkoutHistoryListScreen`'s `ListRow`-based rows for visual consistency
 * rather than a bespoke row component.
 */
export function CalendarDaySessionPicker({
  localDate,
  sessionIds,
  planDayNames,
  testID,
}: CalendarDaySessionPickerProps) {
  const dismiss = useSheetStore((state) => state.dismissCurrent);
  const dateLabel = formatSessionPickerDate(localDate);

  function handleSelect(sessionId: EntityId) {
    dismiss();
    router.push(routes.history.detail(sessionId));
  }

  return (
    <View style={{ flex: 1 }} testID={testID}>
      <Column gap={3} style={{ flex: 1 }}>
        <Row justify="space-between" align="center">
          <Text variant="title3" color="primary" accessibilityRole="header">
            {t('calendar.sessionPicker.title')}
          </Text>
        </Row>
        <Text variant="footnote" color="secondary">
          {t('calendar.sessionPicker.subtitleTemplate', { date: dateLabel })}
        </Text>
        <Column gap={0} style={{ marginTop: space[2] }}>
          {sessionIds.map((sessionId, index) => (
            <ListRow
              key={sessionId}
              title={planDayNames[index] ?? t('calendar.sessionPicker.quickWorkoutLabel')}
              onPress={() => handleSelect(sessionId)}
              showChevron
              testID={testID ? `${testID}-row-${sessionId}` : undefined}
            />
          ))}
        </Column>
      </Column>
    </View>
  );
}

function formatSessionPickerDate(localDate: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(parseLocalDate(localDate));
}
