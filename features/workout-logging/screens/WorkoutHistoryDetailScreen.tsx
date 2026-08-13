import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';

import { Column, Row, Screen } from '@/components/layout';
import { Button, Card, Text, TextField } from '@/components/ui';
import { ConfirmDialog, EmptyState, ErrorState, Skeleton } from '@/components/feedback';
import { formatExerciseName } from '@/features/exercise-library';
import { formatAchievedDate } from '@/features/records';
import { Weight } from '@/domain/Weight';
import { t } from '@/i18n';
import { routes } from '@/navigation/routes';
import { useContainer } from '@/services/container';
import { haptics } from '@/services/haptics';
import { useToastStore } from '@/stores/toastStore';
import { color, radius, space } from '@/theme/tokens';

import { AddExerciseButton } from '../components/AddExerciseButton';
import { ExerciseThumbnail } from '../components/ExerciseThumbnail';
import { formatSessionDurationSeconds } from '../components/formatSessionDuration';
import { setTypeBadgeColor, setTypeLabel } from '../components/setTypeDisplay';
import { SessionExerciseCard } from '../components/SessionExerciseCard';
import { assignSetDisplayNumbers, orderSetsForDisplay } from '../domain/setDisplayNumbering';
import {
  useDeleteSession,
  useHistoricalSessionMutations,
  useSessionDetail,
} from '../hooks/useSessionHistory';
import type { SessionExercise } from '../repository/WorkoutSessionRepository';

export interface WorkoutHistoryDetailScreenProps {
  sessionId: string;
}

/**
 * `app/history/[sessionId].tsx`'s screen body - read-only by default, an
 * "Edit" toggle switches into an editable mode built on the exact same
 * granular mutation methods (via `useHistoricalSessionMutations`) `Pass 2`
 * loosened to accept a `completed` session. Reuses `SessionExerciseCard`/
 * `SetRow` unchanged in edit mode (the same components `ActiveWorkoutScreen`
 * renders) rather than a parallel editable-row implementation - both take
 * the identical `SessionExercise`/`WorkoutSet` shape whether the session is
 * `in_progress` or `completed`, and every one of the granular methods this
 * screen calls already recomputes totals and rebuilds affected personal
 * records server-side (see `WorkoutSessionRepository`'s own top doc
 * comment), so this screen's own job is only to call the right method and
 * let `useSessionDetail`'s query re-fetch, not to recompute anything itself.
 * Read-only mode renders its own lightweight `ReadOnlyExerciseCard` instead -
 * `SessionExerciseCard` is built for active editing (previous-performance
 * panel, progression hints, an always-visible add-set button) that has no
 * place in a plain review of a past session.
 */
export function WorkoutHistoryDetailScreen({ sessionId }: WorkoutHistoryDetailScreenProps) {
  const { sessionService } = useContainer();
  const queryClient = useQueryClient();
  const {
    data: session,
    isPending,
    isError,
    refetch,
  } = useSessionDetail(sessionService, sessionId);
  const mutations = useHistoricalSessionMutations(sessionService, queryClient, sessionId);
  const { deleteSession, isDeleting } = useDeleteSession(sessionService, queryClient, sessionId);

  const [isEditing, setIsEditing] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [focusedSetId, setFocusedSetId] = useState<string | null>(null);

  // Same rationale `WorkoutHistoryListScreen.tsx`/`PersonalRecordsScreen.tsx`
  // document for their own pending announcements: the skeleton below doesn't
  // announce itself, and the error/not-found branches are left alone because
  // `ErrorState` already announces its own message (A11Y-P9-002).
  useEffect(() => {
    if (isPending) {
      AccessibilityInfo.announceForAccessibility(t('common.loading'));
    }
  }, [isPending]);

  // Seeded on entering edit mode (the toggle button's own `onPress`), not via
  // a `useEffect` synced off `session?.notes` - the same "derive from an
  // event, not an effect" shape `WorkoutHeader.tsx`'s `openNotesSheet` already
  // uses for its own notes draft, and the one `react-hooks/set-state-in-effect`
  // flags for a plain effect-driven sync.
  //
  // Toggling edit mode restructures every exercise card beneath this button
  // (read-only lines <-> full editable `SessionExerciseCard`s) with no other
  // signal beyond this button's own label change - a screen-reader user who
  // doesn't keep swiping downward has no way to know the interaction model
  // just changed, so this announces the transition explicitly rather than
  // moving focus (an unsolicited focus jump would be its own violation)
  // (A11Y-P9-003).
  function handleToggleEdit() {
    const next = !isEditing;
    if (next) {
      setNotesDraft(session?.notes ?? '');
    }
    setIsEditing(next);
    AccessibilityInfo.announceForAccessibility(
      next
        ? t('workoutLogging.history.editModeEnabledAnnouncement')
        : t('workoutLogging.history.editModeDisabledAnnouncement'),
    );
  }

  function handleSaveNotes() {
    const next = notesDraft.trim() === '' ? null : notesDraft;
    if (next !== (session?.notes ?? null)) {
      void mutations.updateNotes(next);
    }
  }

  function moveExercise(exercises: readonly SessionExercise[], index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= exercises.length) {
      return;
    }
    const orderedIds = exercises.map((exercise) => exercise.id);
    const [moved] = orderedIds.splice(index, 1);
    if (moved === undefined) {
      return;
    }
    orderedIds.splice(nextIndex, 0, moved);
    void sessionService
      .reorderExercises(sessionId, orderedIds)
      .then(() => refetch())
      .catch(() =>
        useToastStore.getState().show({ message: t('workoutLogging.history.editErrorMessage') }),
      );
  }

  function handleRemoveExercise(exercise: SessionExercise) {
    haptics.destructive();
    void mutations.removeExercise(exercise.id);
    useToastStore.getState().show({
      message: t('workoutLogging.active.exerciseRemovedUndoMessageTemplate', {
        name: exercise.exerciseNameSnapshot,
      }),
      actionLabel: t('common.undo'),
      onAction: () => void mutations.restoreExercise(exercise.id),
    });
  }

  // Sequential, not `exerciseIds.forEach((id) => void mutations.addExercise(id))`:
  // each `addExercise` call opens its own transaction that derives `sort_order`
  // from a fresh `SELECT COUNT(*)`, with no unique constraint on
  // `(session_id, sort_order)` - firing N of them concurrently lets two
  // overlapping transactions read the same stale count before either commits,
  // producing duplicate `sort_order` values. Awaiting one at a time is the
  // simplest correct fix; this add flow is not latency-sensitive enough to
  // warrant a batched multi-insert.
  async function handleAddExercises(exerciseIds: string[]) {
    for (const exerciseId of exerciseIds) {
      await mutations.addExercise(exerciseId);
    }
  }

  function handleDeleteSet(set: { id: string }) {
    haptics.destructive();
    void mutations.deleteSet(set.id);
    useToastStore.getState().show({
      message: t('workoutLogging.active.setDeletedUndoMessage'),
      actionLabel: t('common.undo'),
      onAction: () => void mutations.restoreSet(set.id),
    });
  }

  async function handleConfirmDelete() {
    setDeleteConfirmVisible(false);
    const success = await deleteSession();
    if (!success) {
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(routes.profile.history());
    }
  }

  return (
    <Screen scroll testID="workout-history-detail-screen">
      <Stack.Screen
        options={{
          headerShown: true,
          title: session?.title ?? t('workoutLogging.history.detailTitle'),
          headerStyle: { backgroundColor: color.background },
          headerTintColor: color.textPrimary,
          headerShadowVisible: false,
        }}
      />

      {isPending ? (
        <Column gap={4} style={{ paddingVertical: space[6] }}>
          <Skeleton width="60%" height={28} />
          <Skeleton width="100%" height={120} radius="xl" />
          <Skeleton width="100%" height={160} radius="xl" />
        </Column>
      ) : isError ? (
        <ErrorState
          error={t('workoutLogging.history.detailLoadErrorMessage')}
          onRetry={() => refetch()}
        />
      ) : !session ? (
        <ErrorState error={t('workoutLogging.history.detailNotFoundMessage')} />
      ) : (
        <Column gap={6} style={{ paddingVertical: space[6] }}>
          <Row justify="space-between" align="center">
            <Column gap={1} style={{ flex: 1 }}>
              <Text variant="title2" color="primary" numberOfLines={2}>
                {session.title}
              </Text>
              <Text variant="footnote" color="secondary">
                {formatAchievedDate(session.startedAt)}
              </Text>
            </Column>
            <Button
              variant={isEditing ? 'secondary' : 'ghost'}
              size="sm"
              label={
                isEditing
                  ? t('workoutLogging.history.doneEditingButtonLabel')
                  : t('workoutLogging.history.editButtonLabel')
              }
              onPress={handleToggleEdit}
              testID="workout-history-detail-edit-toggle"
            />
          </Row>

          <Card variant="elevated" padding={4}>
            <Row gap={4} wrap>
              <StatColumn
                label={t('workoutLogging.summary.durationLabel')}
                value={formatSessionDurationSeconds(session.durationSeconds)}
              />
              <StatColumn
                label={t('workoutLogging.summary.exercisesLabel')}
                value={String(session.exercises.length)}
              />
              <StatColumn
                label={t('workoutLogging.summary.setsLabel')}
                value={String(session.totalSets)}
              />
              <StatColumn
                label={t('workoutLogging.summary.repsLabel')}
                value={String(session.totalReps)}
              />
              <StatColumn
                label={t('workoutLogging.summary.volumeLabel')}
                value={t('workoutLogging.summary.volumeValueTemplate', {
                  value: Weight.fromKilograms(session.totalVolumeKg).toDisplayString('kg'),
                })}
              />
              {session.estimatedKcal !== null ? (
                <StatColumn
                  label={t('workoutLogging.summary.caloriesLabel')}
                  value={t('workoutLogging.summary.caloriesValueTemplate', {
                    value: session.estimatedKcal,
                  })}
                />
              ) : null}
            </Row>
          </Card>

          <Column gap={2}>
            <Text variant="label" color="secondary">
              {t('workoutLogging.history.notesLabel')}
            </Text>
            {isEditing ? (
              <TextField
                value={notesDraft}
                onChangeText={setNotesDraft}
                onBlur={handleSaveNotes}
                placeholder={t('workoutLogging.history.notesPlaceholder')}
                testID="workout-history-detail-notes-field"
              />
            ) : session.notes && session.notes.trim() !== '' ? (
              <Text variant="body" color="primary">
                {session.notes}
              </Text>
            ) : (
              <Text variant="footnote" color="tertiary">
                {t('workoutLogging.history.notesPlaceholder')}
              </Text>
            )}
          </Column>

          {session.exercises.length === 0 ? (
            <EmptyState
              title={t('workoutLogging.active.emptyExercisesTitle')}
              message={t('workoutLogging.active.emptyExercisesMessage')}
              testID="workout-history-detail-empty-exercises"
            />
          ) : (
            <Column gap={3}>
              {session.exercises.map((exercise, index) =>
                isEditing ? (
                  <SessionExerciseCard
                    key={exercise.id}
                    exercise={exercise}
                    canMoveUp={index > 0}
                    canMoveDown={index < session.exercises.length - 1}
                    focusedSetId={focusedSetId}
                    latestPR={null}
                    onMoveUp={() => moveExercise(session.exercises, index, -1)}
                    onMoveDown={() => moveExercise(session.exercises, index, 1)}
                    onRemove={() => handleRemoveExercise(exercise)}
                    onUpdateNote={(note) => void mutations.setExerciseNote(exercise.id, note)}
                    onFocusSet={setFocusedSetId}
                    onCompleteSet={(set) => void mutations.completeSet(set.id)}
                    onUncompleteSet={(setId) => void mutations.uncompleteSet(setId)}
                    onUpdateSet={(setId, patch) => void mutations.updateSet(setId, patch)}
                    onDeleteSet={handleDeleteSet}
                    onAddDropSet={(parentSetId) => void mutations.addDropSet(parentSetId)}
                    onAddSet={() => void mutations.appendSet(exercise.id)}
                    isAddingSet={false}
                    testID={`workout-history-exercise-card-${exercise.id}`}
                  />
                ) : (
                  <ReadOnlyExerciseCard
                    key={exercise.id}
                    exercise={exercise}
                    testID={`workout-history-exercise-readonly-${exercise.id}`}
                  />
                ),
              )}
            </Column>
          )}

          {isEditing ? (
            <AddExerciseButton
              alreadySelectedIds={session.exercises.map((exercise) => exercise.exerciseId)}
              onSelect={(exerciseIds) => void handleAddExercises(exerciseIds)}
              testID="workout-history-detail-add-exercise-button"
            />
          ) : null}

          <Button
            variant="destructive"
            label={t('workoutLogging.history.deleteButtonLabel')}
            onPress={() => setDeleteConfirmVisible(true)}
            loading={isDeleting}
            // Blocks a delete from racing an in-flight edit (e.g. `completeSet`'s
            // own `syncCompletedSessionAfterEdit`/PR-rebuild transaction) on the
            // same session_exercise/workout_set/personal_record rows - see
            // `UseHistoricalSessionMutationsResult.isMutating`'s own doc comment.
            disabled={mutations.isMutating}
            fullWidth
            testID="workout-history-detail-delete-button"
          />
        </Column>
      )}

      <ConfirmDialog
        visible={deleteConfirmVisible}
        title={t('workoutLogging.history.deleteConfirmTitle')}
        message={t('workoutLogging.history.deleteConfirmMessage')}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setDeleteConfirmVisible(false)}
        testID="workout-history-detail-delete-confirm-dialog"
      />
    </Screen>
  );
}

function StatColumn({ label, value }: { label: string; value: string }) {
  return (
    <Column gap={1} style={{ minWidth: 96 }}>
      <Text variant="label" color="secondary">
        {label}
      </Text>
      <Text variant="numeric" color="primary">
        {value}
      </Text>
    </Column>
  );
}

/**
 * The read-only counterpart to `SessionExerciseCard` - name, thumbnail, note
 * (if any), and every set as a plain line rather than an editable `SetRow`.
 * Deliberately its own small component rather than a `SetRow` variant: every
 * `SetRow` control (checkbox, number fields, swipe actions) is meaningless
 * outside edit mode, and disabling all of them in place would be more
 * surface area than this flat text rendering. The thumbnail itself is
 * `ExerciseThumbnail`, shared with `ExerciseHeader` (this screen's own
 * edit-mode row) rather than a second copy of its image-resolution logic.
 */
function ReadOnlyExerciseCard({
  exercise,
  testID,
}: {
  exercise: SessionExercise;
  testID?: string;
}) {
  const name = formatExerciseName({
    nameEn: exercise.exercise.nameEn,
    namePl: exercise.exercise.namePl,
    displayNameOverride: exercise.exercise.displayNameOverride,
  });
  const orderedSets = orderSetsForDisplay(exercise.sets);
  const displayNumbers = assignSetDisplayNumbers(exercise.sets);

  return (
    <Card variant="elevated" padding={4} testID={testID}>
      <Column gap={3}>
        <Row gap={3} align="center">
          <ExerciseThumbnail primaryImage={exercise.exercise.primaryImage} />
          <Text variant="bodyMedium" color="primary" numberOfLines={1} style={{ flex: 1 }}>
            {name}
          </Text>
        </Row>

        {exercise.note && exercise.note.trim() !== '' ? (
          <Text variant="footnote" color="secondary">
            {exercise.note}
          </Text>
        ) : null}

        <Column gap={1}>
          {orderedSets.map((workoutSet) => {
            const displayNumber = displayNumbers.get(workoutSet.id);
            if (!displayNumber) {
              return null;
            }
            return (
              <Row
                key={workoutSet.id}
                gap={2}
                align="center"
                style={{ paddingVertical: space['0.5'] }}
              >
                <Ionicons
                  name={workoutSet.isCompleted ? 'checkmark-circle' : 'ellipse-outline'}
                  size={16}
                  color={workoutSet.isCompleted ? color.success : color.textTertiary}
                />
                <Text variant="numeric" color="secondary" style={{ minWidth: 20 }}>
                  {displayNumber.label}
                </Text>
                <View
                  style={{
                    paddingHorizontal: space[1],
                    borderRadius: radius.sm,
                    backgroundColor: setTypeBadgeColor(workoutSet.setType),
                  }}
                >
                  <Text variant="caption" color="inverse" numberOfLines={1}>
                    {setTypeLabel(workoutSet.setType)}
                  </Text>
                </View>
                <Text variant="body" color="primary">
                  {workoutSet.weightKg !== null && workoutSet.reps !== null
                    ? t('workoutLogging.history.setLineTemplate', {
                        weight: workoutSet.weightKg,
                        reps: workoutSet.reps,
                      })
                    : '-'}
                </Text>
              </Row>
            );
          })}
        </Column>
      </Column>
    </Card>
  );
}
