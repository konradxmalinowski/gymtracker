import { Ionicons } from '@expo/vector-icons';
import { Image, View } from 'react-native';

// No `@/assets/*` tsconfig path alias exists yet - see ExerciseImageGallery.tsx's identical note.
import { getExerciseImageSource } from '../../../assets/exercises';
import { Row, Column } from '@/components/layout';
import { Badge, IconButton, Text } from '@/components/ui';
import { PressScale } from '@/components/gestures/PressScale';
import { formatExerciseName, type ExerciseListItem } from '@/features/exercise-library';
import { t } from '@/i18n';
import { color, radius, space } from '@/theme/tokens';

import { getEquipmentLabel, getLevelLabel } from '../types/labels';

const THUMBNAIL_SIZE = 48;

export interface ExerciseListItemRowProps {
  item: ExerciseListItem;
  onPress: () => void;
  onToggleFavorite: () => void;
  testID?: string | undefined;
}

/**
 * A single library-screen row. The favorite `IconButton` sits inside the same
 * `PressScale` that navigates to the detail screen - the identical nesting
 * `ListRow.tsx` already uses for its `trailing` slot (e.g. the haptics settings
 * `Switch`), which RN's touch responder system already resolves correctly: the
 * inner control claims its own taps, the outer row claims everything else.
 */
export function ExerciseListItemRow({
  item,
  onPress,
  onToggleFavorite,
  testID,
}: ExerciseListItemRowProps) {
  const name = formatExerciseName({
    nameEn: item.nameEn,
    namePl: item.namePl,
    displayNameOverride: item.displayNameOverride,
  });
  const imageSource = getExerciseImageSource(item.primaryImage ?? undefined);

  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={name}
      style={{
        borderBottomWidth: 1,
        borderBottomColor: color.border,
      }}
      testID={testID}
    >
      <Row
        gap={3}
        align="center"
        style={{ paddingVertical: space[3], paddingHorizontal: space[4] }}
      >
        <View
          style={{
            width: THUMBNAIL_SIZE,
            height: THUMBNAIL_SIZE,
            borderRadius: radius.md,
            overflow: 'hidden',
            backgroundColor: color.surfaceElevated,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {imageSource ? (
            <Image
              source={imageSource}
              style={{ width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE }}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <Ionicons name="barbell-outline" size={20} color={color.textTertiary} />
          )}
        </View>

        <Column gap={1} style={{ flex: 1 }}>
          <Text variant="bodyMedium" color="primary" numberOfLines={1}>
            {name}
          </Text>
          <Row gap={2}>
            {item.equipmentSlug ? (
              <Badge label={getEquipmentLabel(item.equipmentSlug)} size="sm" />
            ) : null}
            {item.level ? (
              <Badge label={getLevelLabel(item.level)} size="sm" tone="accent" />
            ) : null}
          </Row>
        </Column>

        <IconButton
          icon={
            <Ionicons
              name={item.isFavorite ? 'heart' : 'heart-outline'}
              size={20}
              color={item.isFavorite ? color.danger : color.textTertiary}
            />
          }
          variant="ghost"
          accessibilityLabel={
            item.isFavorite
              ? t('exerciseLibrary.unfavoriteAccessibilityLabelTemplate', { name })
              : t('exerciseLibrary.favoriteAccessibilityLabelTemplate', { name })
          }
          onPress={onToggleFavorite}
          testID={testID ? `${testID}-favorite` : undefined}
        />
      </Row>
    </PressScale>
  );
}
