import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Linking } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';

import { Column, Row, Screen } from '@/components/layout';
import {
  Badge,
  Button,
  ConfirmDialog,
  IconButton,
  ListRow,
  Section,
  StepperField,
  Surface,
  Text,
  TextField,
} from '@/components/ui';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback';
import {
  EXERCISE_REST_SECONDS_MAX,
  ExerciseDeleteBlockedError,
  formatExerciseName,
} from '@/features/exercise-library';
import { haptics } from '@/services/haptics';
import { t } from '@/i18n';
import { routes } from '@/navigation/routes';
import { color, space } from '@/theme/tokens';

import { ExerciseImageGallery } from '../components/ExerciseImageGallery';
import { PerformanceEmptySection } from '../components/PerformanceEmptySection';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useDeleteExercise } from '../hooks/useDeleteExercise';
import { useExercise } from '../hooks/useExercise';
import { useSetExerciseNote } from '../hooks/useSetExerciseNote';
import { useSetExerciseRest } from '../hooks/useSetExerciseRest';
import { useToggleExerciseFavorite } from '../hooks/useToggleExerciseFavorite';
import {
  getBodyPartLabel,
  getEquipmentLabel,
  getLevelLabel,
  getMuscleLabel,
} from '../types/labels';

const REST_SAVE_DEBOUNCE_MS = 500;

/** `app/(tabs)/exercises/[id].tsx`'s screen body. */
export function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: exercise, isPending, isError, refetch } = useExercise(id);

  const toggleFavorite = useToggleExerciseFavorite();
  const setNote = useSetExerciseNote();
  const setRest = useSetExerciseRest();
  const deleteExercise = useDeleteExercise();

  const [noteText, setNoteText] = useState('');
  const [restSeconds, setRestSeconds] = useState<number | null>(null);
  const syncedIdRef = useRef<string | null>(null);
  const debouncedRestSeconds = useDebouncedValue(restSeconds, REST_SAVE_DEBOUNCE_MS);

  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);
  const [blockingPlanNames, setBlockingPlanNames] = useState<string[] | null>(null);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);

  // Re-seed local (note/rest) draft state only when the loaded exercise's id
  // actually changes - not on every refetch/invalidation - so an in-flight edit
  // is never clobbered by the very mutation that's saving it.
  useEffect(() => {
    if (exercise && syncedIdRef.current !== exercise.id) {
      syncedIdRef.current = exercise.id;
      setNoteText(exercise.userData.note ?? '');
      setRestSeconds(exercise.userData.defaultRestSeconds);
    }
  }, [exercise]);

  useEffect(() => {
    if (
      exercise &&
      syncedIdRef.current === exercise.id &&
      debouncedRestSeconds !== exercise.userData.defaultRestSeconds
    ) {
      setRest.mutate({ id: exercise.id, seconds: debouncedRestSeconds });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedRestSeconds]);

  if (isPending) {
    return (
      <Screen testID="exercise-detail-screen" scroll>
        <Column gap={4} style={{ paddingVertical: space[4] }}>
          <Skeleton width="100%" height={280} radius="xl" />
          <Skeleton width="70%" height={28} />
          <Skeleton width="40%" height={16} />
        </Column>
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen testID="exercise-detail-screen">
        <ErrorState
          error={t('exerciseLibrary.detail.loadErrorMessage')}
          onRetry={() => refetch()}
        />
      </Screen>
    );
  }

  if (!exercise) {
    return (
      <Screen testID="exercise-detail-screen">
        <ErrorState error={t('exerciseLibrary.detail.notFoundMessage')} />
      </Screen>
    );
  }

  const name = formatExerciseName({
    nameEn: exercise.nameEn,
    namePl: exercise.namePl,
    displayNameOverride: exercise.userData.displayNameOverride,
  });
  const isCustom = exercise.source === 'custom';
  const primaryMuscles = exercise.muscles.filter((muscle) => muscle.role === 'primary');
  const secondaryMuscles = exercise.muscles.filter((muscle) => muscle.role === 'secondary');

  function handleToggleFavorite() {
    if (!exercise) return;
    haptics.select();
    const nextValue = !exercise.userData.isFavorite;
    toggleFavorite.mutate({ id: exercise.id, value: nextValue });
    // The favorite `IconButton`'s `accessibilityLabel` does flip to reflect
    // the new state, but a plain `accessibilityRole="button"` (unlike a
    // native `switch`) isn't guaranteed to have its changed label re-read by
    // VoiceOver/TalkBack while focus stays put - same "silent state change"
    // gap the announcement pattern in TextField.tsx/ErrorState.tsx/Toast.tsx
    // already exists to close (accessibility audit A11Y-002).
    AccessibilityInfo.announceForAccessibility(
      nextValue
        ? t('exerciseLibrary.favoriteAddedAnnouncement')
        : t('exerciseLibrary.favoriteRemovedAnnouncement'),
    );
  }

  function handleNoteBlur() {
    if (!exercise) return;
    const currentNote = exercise.userData.note ?? '';
    if (noteText !== currentNote) {
      setNote.mutate({ id: exercise.id, note: noteText.trim() === '' ? null : noteText });
    }
  }

  function handleDeletePress() {
    setDeleteErrorMessage(null);
    setConfirmDeleteVisible(true);
  }

  async function handleConfirmDelete() {
    if (!exercise) return;
    setConfirmDeleteVisible(false);
    try {
      await deleteExercise.mutateAsync(exercise.id);
      haptics.destructive();
      router.back();
    } catch (error) {
      if (error instanceof ExerciseDeleteBlockedError) {
        setBlockingPlanNames(error.blockingPlans.map((plan) => plan.planName));
      } else {
        setDeleteErrorMessage(t('exerciseLibrary.detail.loadErrorMessage'));
      }
    }
  }

  return (
    <Screen testID="exercise-detail-screen" scroll>
      {/* Per-instance dynamic header title (the exercise name isn't known
          until the query resolves) - overrides the static fallback title
          `app/(tabs)/exercises/_layout.tsx` sets for this route. */}
      <Stack.Screen options={{ title: name }} />
      <Column gap={6} style={{ paddingVertical: space[4] }}>
        <ExerciseImageGallery
          images={exercise.images}
          exerciseName={name}
          testID="exercise-detail-gallery"
        />

        <Column gap={2}>
          <Row justify="space-between" align="center">
            <Text variant="title1" color="primary" style={{ flex: 1 }}>
              {name}
            </Text>
            <IconButton
              icon={
                <Ionicons
                  name={exercise.userData.isFavorite ? 'heart' : 'heart-outline'}
                  size={22}
                  color={exercise.userData.isFavorite ? color.danger : color.textTertiary}
                />
              }
              variant="ghost"
              accessibilityLabel={
                exercise.userData.isFavorite
                  ? t('exerciseLibrary.unfavoriteAccessibilityLabelTemplate', { name })
                  : t('exerciseLibrary.favoriteAccessibilityLabelTemplate', { name })
              }
              onPress={handleToggleFavorite}
              testID="exercise-detail-favorite"
            />
          </Row>
          <Row gap={2} wrap>
            {isCustom ? (
              <Badge label={t('exerciseLibrary.detail.customBadgeLabel')} tone="accent" />
            ) : null}
            {exercise.equipmentSlug ? (
              <Badge label={getEquipmentLabel(exercise.equipmentSlug)} />
            ) : null}
            {exercise.level ? <Badge label={getLevelLabel(exercise.level)} tone="accent" /> : null}
            {exercise.bodyPart ? <Badge label={getBodyPartLabel(exercise.bodyPart)} /> : null}
          </Row>
        </Column>

        {exercise.muscles.length > 0 ? (
          <Section title={t('exerciseLibrary.detail.musclesTitle')}>
            <Column gap={2}>
              {primaryMuscles.length > 0 ? (
                <MuscleTagRow
                  label={t('exerciseLibrary.detail.primaryMusclesLabel')}
                  muscles={primaryMuscles}
                  tone="accent"
                />
              ) : null}
              {secondaryMuscles.length > 0 ? (
                <MuscleTagRow
                  label={t('exerciseLibrary.detail.secondaryMusclesLabel')}
                  muscles={secondaryMuscles}
                  tone="neutral"
                />
              ) : null}
            </Column>
          </Section>
        ) : null}

        {exercise.instructions.length > 0 ? (
          <Section title={t('exerciseLibrary.detail.instructionsTitle')}>
            <Surface level={1} radius="lg" padding={4}>
              <Column gap={3}>
                {exercise.instructions.map((step, index) => (
                  <Row key={index} gap={3} align="flex-start">
                    <Text variant="bodyMedium" color="accent">
                      {index + 1}.
                    </Text>
                    <Text variant="body" color="primary" style={{ flex: 1 }}>
                      {step}
                    </Text>
                  </Row>
                ))}
              </Column>
            </Surface>
          </Section>
        ) : null}

        <Section title={t('exerciseLibrary.detail.videosTitle')}>
          {exercise.videos.length === 0 ? (
            <Surface level={1} radius="lg">
              <EmptyState
                illustration={
                  <Ionicons name="videocam-outline" size={32} color={color.textTertiary} />
                }
                title={t('exerciseLibrary.detail.noVideosMessage')}
                testID="exercise-detail-videos-empty"
              />
            </Surface>
          ) : (
            <Surface level={1} radius="lg">
              {exercise.videos.map((video) => (
                <ListRow
                  key={video.id}
                  title={video.title}
                  subtitle={video.channel ?? undefined}
                  leading={<Ionicons name="play-circle-outline" size={20} color={color.accent} />}
                  onPress={() => void Linking.openURL(video.url)}
                  showChevron
                  testID={`exercise-detail-video-${video.id}`}
                />
              ))}
            </Surface>
          )}
        </Section>

        <Section title={t('exerciseLibrary.detail.noteTitle')}>
          <TextField
            value={noteText}
            onChangeText={setNoteText}
            onBlur={handleNoteBlur}
            placeholder={t('exerciseLibrary.detail.notePlaceholder')}
            testID="exercise-detail-note-field"
          />
        </Section>

        <Section title={t('exerciseLibrary.detail.restTitle')}>
          <StepperField
            value={restSeconds}
            onChange={setRestSeconds}
            step={15}
            min={0}
            max={EXERCISE_REST_SECONDS_MAX}
            unitSuffix={t('exerciseLibrary.detail.restUnitSuffix')}
            accessibilityLabel={t('exerciseLibrary.detail.restAccessibilityLabel')}
            testID="exercise-detail-rest-field"
          />
        </Section>

        <PerformanceEmptySection
          sectionTitle={t('exerciseLibrary.detail.previousPerformanceTitle')}
          emptyTitle={t('exerciseLibrary.detail.previousPerformanceEmptyTitle')}
          message={t('exerciseLibrary.detail.previousPerformanceEmptyMessage')}
          icon={<Ionicons name="time-outline" size={32} color={color.textTertiary} />}
          testID="exercise-detail-previous-performance"
        />

        <PerformanceEmptySection
          sectionTitle={t('exerciseLibrary.detail.personalRecordsTitle')}
          emptyTitle={t('exerciseLibrary.detail.personalRecordsEmptyTitle')}
          message={t('exerciseLibrary.detail.personalRecordsEmptyMessage')}
          icon={<Ionicons name="trophy-outline" size={32} color={color.textTertiary} />}
          testID="exercise-detail-personal-records"
        />

        <PerformanceEmptySection
          sectionTitle={t('exerciseLibrary.detail.progressChartTitle')}
          emptyTitle={t('exerciseLibrary.detail.progressChartEmptyTitle')}
          message={t('exerciseLibrary.detail.progressChartEmptyMessage')}
          icon={<Ionicons name="stats-chart-outline" size={32} color={color.textTertiary} />}
          testID="exercise-detail-progress-chart"
        />

        {isCustom ? (
          <Row gap={3}>
            <Button
              variant="secondary"
              label={t('exerciseLibrary.detail.editButtonLabel')}
              onPress={() => router.push(routes.exercises.edit(exercise.id))}
              testID="exercise-detail-edit-button"
            />
            <Button
              variant="destructive"
              label={t('exerciseLibrary.detail.deleteButtonLabel')}
              onPress={handleDeletePress}
              loading={deleteExercise.isPending}
              testID="exercise-detail-delete-button"
            />
          </Row>
        ) : null}

        {deleteErrorMessage ? (
          <Text
            variant="caption"
            color="danger"
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
          >
            {deleteErrorMessage}
          </Text>
        ) : null}
      </Column>

      <ConfirmDialog
        visible={confirmDeleteVisible}
        title={t('exerciseLibrary.detail.deleteConfirmTitle')}
        message={t('exerciseLibrary.detail.deleteConfirmMessage')}
        confirmLabel={t('exerciseLibrary.detail.deleteButtonLabel')}
        destructive
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setConfirmDeleteVisible(false)}
        testID="exercise-detail-delete-confirm-dialog"
      />

      <ConfirmDialog
        visible={blockingPlanNames !== null}
        title={t('exerciseLibrary.detail.deleteBlockedTitle')}
        message={t('exerciseLibrary.detail.deleteBlockedMessageTemplate', {
          plans: blockingPlanNames?.join(', ') ?? '',
        })}
        confirmLabel={t('common.done')}
        onConfirm={() => setBlockingPlanNames(null)}
        onCancel={() => setBlockingPlanNames(null)}
        testID="exercise-detail-delete-blocked-dialog"
      />
    </Screen>
  );
}

function MuscleTagRow({
  label,
  muscles,
  tone,
}: {
  label: string;
  muscles: readonly { slug: string }[];
  tone: 'accent' | 'neutral';
}) {
  return (
    <Column gap={2}>
      <Text variant="label" color="secondary">
        {label}
      </Text>
      <Row gap={2} wrap>
        {muscles.map((muscle) => (
          <Badge key={muscle.slug} label={getMuscleLabel(muscle.slug)} tone={tone} />
        ))}
      </Row>
    </Column>
  );
}
