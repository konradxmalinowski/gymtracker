import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';

import { Column, Row, Screen } from '@/components/layout';
import { Badge, IconButton, Text, TextField } from '@/components/ui';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback';
import { haptics } from '@/services/haptics';
import { t } from '@/i18n';
import { routes } from '@/navigation/routes';
import { useSheetStore } from '@/stores/sheetStore';
import { color, space } from '@/theme/tokens';
import type { ExerciseListItem } from '@/features/exercise-library';

import { ExerciseFilterSheetContent } from '../components/ExerciseFilterSheetContent';
import { ExerciseListItemRow } from '../components/ExerciseListItemRow';
import { countActiveFilterCategories, useExerciseFilterStore } from '../hooks/exerciseFilterStore';
import { useExerciseSearch } from '../hooks/useExerciseSearch';
import { useToggleExerciseFavorite } from '../hooks/useToggleExerciseFavorite';

const FILTER_SHEET_ID = 'exercise-filters';

/** `app/(tabs)/exercises/index.tsx`'s screen body (CLAUDE.md: "app/ never contains screen bodies"). */
export function ExerciseLibraryScreen() {
  const [searchText, setSearchText] = useState('');
  const filters = useExerciseFilterStore((state) => state.filters);
  const activeFilterCount = countActiveFilterCategories(filters);

  const { data, isPending, isError, refetch } = useExerciseSearch(searchText, filters);
  const toggleFavorite = useToggleExerciseFavorite();

  const isUnfilteredEmptyCatalog =
    searchText.trim() === '' &&
    activeFilterCount === 0 &&
    !isPending &&
    !isError &&
    data?.length === 0;

  // Search/filter results replace the list silently under a VoiceOver/TalkBack
  // user with no other cue - the visible "N exercises" line already updates,
  // this makes it audible too, matching the announce-on-change pattern
  // TextField.tsx/ErrorState.tsx/Toast.tsx already establish (accessibility
  // audit A11Y-002). Skipped on the very first resolved load: nothing changed
  // out from under the user yet, so there's nothing to announce.
  const hasAnnouncedInitialResults = useRef(false);
  useEffect(() => {
    if (isPending || isError) {
      return;
    }
    if (!hasAnnouncedInitialResults.current) {
      hasAnnouncedInitialResults.current = true;
      return;
    }
    AccessibilityInfo.announceForAccessibility(
      t('exerciseLibrary.resultCount', { count: data?.length ?? 0 }),
    );
  }, [data, isPending, isError]);

  function openFilterSheet() {
    useSheetStore.getState().present({
      id: FILTER_SHEET_ID,
      content: <ExerciseFilterSheetContent />,
      snapPoints: [0.85],
    });
  }

  function handleToggleFavorite(item: ExerciseListItem) {
    haptics.select();
    const nextValue = !item.isFavorite;
    toggleFavorite.mutate({ id: item.id, value: nextValue });
    // Same "silent state change" gap as the detail screen's favorite toggle
    // (see ExerciseDetailScreen.tsx's handleToggleFavorite) - a plain
    // `accessibilityRole="button"` doesn't get its changed label re-read
    // automatically, so an explicit announcement closes the gap here too.
    AccessibilityInfo.announceForAccessibility(
      nextValue
        ? t('exerciseLibrary.favoriteAddedAnnouncement')
        : t('exerciseLibrary.favoriteRemovedAnnouncement'),
    );
  }

  return (
    <Screen testID="exercise-library-screen" padded={false} edges={['top', 'bottom']}>
      <Column gap={3} style={{ flex: 1 }}>
        <Row gap={2} align="center" style={{ paddingHorizontal: space[4], paddingTop: space[3] }}>
          <View style={{ flex: 1 }}>
            <TextField
              value={searchText}
              onChangeText={setSearchText}
              placeholder={t('exerciseLibrary.searchPlaceholder')}
              testID="exercise-search-field"
            />
          </View>
          <View>
            <IconButton
              icon={<Ionicons name="options-outline" size={20} color={color.textPrimary} />}
              accessibilityLabel={t('exerciseLibrary.filtersButtonLabel')}
              onPress={openFilterSheet}
              testID="exercise-filters-button"
            />
            {activeFilterCount > 0 ? (
              <View style={{ position: 'absolute', top: -4, right: -4 }}>
                <Badge label={String(activeFilterCount)} tone="accent" size="sm" />
              </View>
            ) : null}
          </View>
        </Row>

        {!isPending && !isError ? (
          <Text
            variant="footnote"
            color="secondary"
            style={{ paddingHorizontal: space[4] }}
            accessibilityLiveRegion="polite"
            testID="exercise-result-count"
          >
            {t('exerciseLibrary.resultCount', { count: data?.length ?? 0 })}
          </Text>
        ) : null}

        <View style={{ flex: 1 }}>
          {isPending ? (
            <ExerciseListSkeleton />
          ) : isError ? (
            <ErrorState error={t('exerciseLibrary.loadErrorMessage')} onRetry={() => refetch()} />
          ) : !data || data.length === 0 ? (
            <EmptyState
              illustration={<Ionicons name="search-outline" size={48} color={color.textTertiary} />}
              title={
                isUnfilteredEmptyCatalog
                  ? t('exerciseLibrary.catalogNotSeededTitle')
                  : t('exerciseLibrary.emptyResultsTitle')
              }
              message={
                isUnfilteredEmptyCatalog
                  ? t('exerciseLibrary.catalogNotSeededMessage')
                  : t('exerciseLibrary.emptyResultsMessage')
              }
              testID="exercise-library-empty-state"
            />
          ) : (
            <FlashList
              data={data}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <ExerciseListItemRow
                  item={item}
                  onPress={() => router.push(routes.exercises.detail(item.id))}
                  onToggleFavorite={() => handleToggleFavorite(item)}
                  testID={`exercise-row-${item.id}`}
                />
              )}
              contentContainerStyle={{ paddingBottom: space[20] }}
              testID="exercise-library-list"
            />
          )}
        </View>

        <View style={{ position: 'absolute', right: space[4], bottom: space[6] }}>
          <IconButton
            icon={<Ionicons name="add" size={24} color={color.accent} />}
            size="lg"
            variant="accent"
            accessibilityLabel={t('exerciseLibrary.addButtonLabel')}
            onPress={() => router.push(routes.exercises.create())}
            testID="exercise-add-button"
          />
        </View>
      </Column>
    </Screen>
  );
}

function ExerciseListSkeleton() {
  return (
    <Column gap={4} style={{ padding: space[4] }}>
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <Row key={index} gap={3} align="center">
          <Skeleton width={48} height={48} radius="md" />
          <Column gap={2} style={{ flex: 1 }}>
            <Skeleton width="70%" height={16} />
            <Skeleton width="40%" height={12} />
          </Column>
        </Row>
      ))}
    </Column>
  );
}
