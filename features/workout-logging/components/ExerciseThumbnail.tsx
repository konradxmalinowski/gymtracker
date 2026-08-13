import { Ionicons } from '@expo/vector-icons';
import { Image, View } from 'react-native';

// No `@/assets/*` tsconfig path alias exists yet - see `ExerciseHeader.tsx`'s
// identical import for the same note.
import { getExerciseImageSource } from '../../../assets/exercises';
import { color, radius } from '@/theme/tokens';

/**
 * The single size both `ExerciseHeader` (the active/editable exercise row)
 * and `WorkoutHistoryDetailScreen`'s read-only counterpart render this at -
 * previously two independently-hardcoded `THUMBNAIL_SIZE` constants (44 and
 * 40) that had already drifted apart. One constant, one place to change it.
 */
export const EXERCISE_THUMBNAIL_SIZE = 44;

export interface ExerciseThumbnailProps {
  /** `exercise.exercise.primaryImage` - already `string | null` on the row shape. */
  primaryImage: string | null | undefined;
  testID?: string;
}

/**
 * Resolves and renders one exercise's catalog thumbnail: the image if the
 * catalog has one, else a fallback icon - the block `ExerciseHeader.tsx` and
 * `WorkoutHistoryDetailScreen.tsx`'s `ReadOnlyExerciseCard` both used to
 * duplicate wholesale (image source resolution, sizing, and the fallback
 * icon). Extracted rather than folding the read-only card into
 * `ExerciseHeader` itself - that component's contract is built around active
 * editing (move up/down, remove, an inline note editor) with no read-only
 * mode of its own, and none of that has any place in a plain review of a
 * past session.
 */
export function ExerciseThumbnail({ primaryImage, testID }: ExerciseThumbnailProps) {
  const imageSource = getExerciseImageSource(primaryImage ?? undefined);

  return (
    <View
      testID={testID}
      style={{
        width: EXERCISE_THUMBNAIL_SIZE,
        height: EXERCISE_THUMBNAIL_SIZE,
        borderRadius: radius.md,
        overflow: 'hidden',
        backgroundColor: color.surface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {imageSource ? (
        <Image
          source={imageSource}
          style={{ width: EXERCISE_THUMBNAIL_SIZE, height: EXERCISE_THUMBNAIL_SIZE }}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Ionicons name="barbell-outline" size={20} color={color.textTertiary} />
      )}
    </View>
  );
}
