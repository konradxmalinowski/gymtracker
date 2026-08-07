import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Column, Row } from '@/components/layout';
import { BottomSheet, Button, IconButton, Text, TextField } from '@/components/ui';
import { t } from '@/i18n';
import { useContainer } from '@/services/container';
import { color, space } from '@/theme/tokens';

import { formatElapsedSeconds } from './formatElapsed';

export interface WorkoutHeaderProps {
  title: string;
  startedAt: number;
  pausedMs: number;
  /** FR-16 workout-level note (`ActiveSessionAggregate.notes`). */
  notes: string | null;
  onMinimize: () => void;
  onFinish: () => void;
  onDiscard: () => void;
  /** `setSessionNotes(sessionId, notes)` through `useSetSessionNotes`. `null` clears it. */
  onUpdateNotes: (notes: string | null) => void;
  isFinishing: boolean;
  testID?: string | undefined;
}

const TICK_MS = 1000;

/**
 * ARCHITECTURE.md section 10.3: "elapsed timer, workout title, Minimize,
 * Finish". Discard lives here too as a single always-visible danger-colored
 * icon action rather than behind a hidden overflow menu - this UI kit has no
 * menu/popover primitive yet, and one always-reachable, clearly-marked
 * button is at least as discoverable as a menu item behind a "..." trigger,
 * so this doesn't wait on a new primitive being built. Gating it behind
 * `shouldConfirmDiscard()` is `ActiveWorkoutScreen`'s job, not this
 * component's - `onDiscard` here is already the fully-resolved trigger.
 *
 * The workout-level note (FR-16) was not part of ARCHITECTURE.md 10.3's
 * original element list for this header - it's placed as a third icon
 * button in the same right-hand action cluster as Discard, ahead of it, for
 * two reasons: the title/elapsed-time area on the left is plain text with no
 * existing tap target to overload, and the right cluster is already this
 * header's home for "secondary, not-the-primary-Finish-action" controls, so
 * a notes button reads as one more of those rather than a new kind of
 * control. Opens a `BottomSheet` (not inline) because a workout-level note is
 * open-ended free text entered once per session, not a per-field quick edit -
 * the same shape `PlanDetailScreen`'s rename/add-day sheets already use for
 * "a `TextField` plus a Save button."
 *
 * The clock (`elapsedMs`) is a local `setInterval`, deliberately not backed
 * by `activeWorkoutStore` - a ticking value re-rendering this header every
 * second must never re-render the exercise list beneath it, which is exactly
 * what ADR-0008 rule 5 (selector-only store consumption) exists to prevent.
 */
export function WorkoutHeader({
  title,
  startedAt,
  pausedMs,
  notes,
  onMinimize,
  onFinish,
  onDiscard,
  onUpdateNotes,
  isFinishing,
  testID,
}: WorkoutHeaderProps) {
  const { clock } = useContainer();
  const [now, setNow] = useState(() => clock.now());
  const [notesSheetVisible, setNotesSheetVisible] = useState(false);
  const [notesDraft, setNotesDraft] = useState(notes ?? '');

  useEffect(() => {
    const interval = setInterval(() => setNow(clock.now()), TICK_MS);
    return () => clearInterval(interval);
  }, [clock]);

  function openNotesSheet() {
    setNotesDraft(notes ?? '');
    setNotesSheetVisible(true);
  }

  function handleSaveNotes() {
    onUpdateNotes(notesDraft.trim() === '' ? null : notesDraft);
    setNotesSheetVisible(false);
  }

  const hasNotes = notes !== null && notes.trim() !== '';

  return (
    <View testID={testID}>
      <Row
        justify="space-between"
        align="center"
        style={{
          paddingHorizontal: space[4],
          paddingVertical: space[3],
          borderBottomWidth: 1,
          borderBottomColor: color.border,
        }}
      >
        <Row gap={2} align="center">
          <IconButton
            icon={<Ionicons name="chevron-down" size={20} color={color.textPrimary} />}
            variant="ghost"
            accessibilityLabel={t('workoutLogging.active.minimizeAccessibilityLabel')}
            onPress={onMinimize}
            testID={testID ? `${testID}-minimize` : undefined}
          />
          <View>
            <Text variant="bodyMedium" color="primary" numberOfLines={1}>
              {title}
            </Text>
            <Text
              variant="numeric"
              color="secondary"
              testID={testID ? `${testID}-elapsed` : undefined}
            >
              {formatElapsedSeconds(startedAt, pausedMs, now)}
            </Text>
          </View>
        </Row>

        <Row gap={2} align="center">
          <IconButton
            icon={
              <Ionicons
                name={hasNotes ? 'document-text' : 'document-text-outline'}
                size={18}
                color={hasNotes ? color.accent : color.textTertiary}
              />
            }
            variant="ghost"
            accessibilityLabel={t('workoutLogging.header.notesAccessibilityLabel')}
            onPress={openNotesSheet}
            testID={testID ? `${testID}-notes` : undefined}
          />
          <IconButton
            icon={<Ionicons name="trash-outline" size={18} color={color.danger} />}
            variant="ghost"
            accessibilityLabel={t('workoutLogging.active.discardButtonLabel')}
            onPress={onDiscard}
            testID={testID ? `${testID}-discard` : undefined}
          />
          <Button
            variant="primary"
            size="sm"
            label={t('workoutLogging.active.finishButtonLabel')}
            onPress={onFinish}
            loading={isFinishing}
            testID={testID ? `${testID}-finish` : undefined}
          />
        </Row>
      </Row>

      <BottomSheet
        visible={notesSheetVisible}
        onDismiss={() => setNotesSheetVisible(false)}
        snapPoints={[0.5]}
        testID={testID ? `${testID}-notes-sheet` : undefined}
      >
        <Column gap={4} style={{ paddingTop: space[2] }}>
          <Text variant="title3" color="primary">
            {t('workoutLogging.header.notesSheetTitle')}
          </Text>
          <TextField
            label={t('workoutLogging.header.notesFieldLabel')}
            value={notesDraft}
            onChangeText={setNotesDraft}
            placeholder={t('workoutLogging.header.notesPlaceholder')}
            testID={testID ? `${testID}-notes-field` : undefined}
          />
          <Button
            variant="primary"
            label={t('common.save')}
            onPress={handleSaveNotes}
            fullWidth
            testID={testID ? `${testID}-notes-save` : undefined}
          />
        </Column>
      </BottomSheet>
    </View>
  );
}
