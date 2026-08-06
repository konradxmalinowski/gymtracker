import { Ionicons } from '@expo/vector-icons';
import { Image, ScrollView, View } from 'react-native';

// No `@/assets/*` tsconfig path alias exists yet (only the aliases already
// listed in tsconfig.json - not this phase's file to add one to), so this is a
// plain relative import rather than `@/assets/exercises`.
import { getExerciseImageSource } from '../../../assets/exercises';
import { t } from '@/i18n';
import { color, radius, space } from '@/theme/tokens';

const IMAGE_SIZE = 280;

export interface ExerciseImageGalleryProps {
  images: readonly string[];
  /**
   * The exercise's display name, used only to build each image's
   * `accessibilityLabel` (e.g. "Barbell Squat, photo 1 of 3") - these images
   * convey real exercise-form information, so a screen reader user needs
   * more than a generic "image" announcement per accessibility review
   * (features/exercise-library P4 pass).
   */
  exerciseName: string;
  testID?: string | undefined;
}

/**
 * Horizontally-scrolling gallery, one full-width-ish card per image
 * (`ARCHITECTURE.md` leaves the exact layout to this phase's judgment). An
 * unresolvable filename (`getExerciseImageSource` returning `undefined`, e.g. a
 * stale catalog entry) renders a placeholder tile instead of being skipped
 * silently, so the gallery's item count still matches `images.length`.
 *
 * Each resolved image is individually `accessible` with a name/position
 * label - a plain RN `ScrollView` needs no extra wiring for VoiceOver/TalkBack
 * swipe navigation beyond that: once a child is accessible, the platform
 * screen reader already scrolls it into view as the user swipes past it.
 */
export function ExerciseImageGallery({ images, exerciseName, testID }: ExerciseImageGalleryProps) {
  if (images.length === 0) {
    return (
      <View
        style={{
          width: '100%',
          height: IMAGE_SIZE,
          borderRadius: radius.xl,
          backgroundColor: color.surfaceElevated,
          alignItems: 'center',
          justifyContent: 'center',
        }}
        testID={testID}
      >
        <Ionicons name="barbell-outline" size={48} color={color.textTertiary} />
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: space[2] }}
      testID={testID}
    >
      {images.map((filename, index) => {
        const source = getExerciseImageSource(filename);
        const imageLabel = t('exerciseLibrary.detail.imageAccessibilityLabelTemplate', {
          name: exerciseName,
          index: index + 1,
          count: images.length,
        });
        return (
          <View
            key={`${filename}-${index}`}
            accessible
            accessibilityRole="image"
            accessibilityLabel={
              source ? imageLabel : t('exerciseLibrary.detail.imageUnavailableLabel')
            }
            style={{
              width: IMAGE_SIZE,
              height: IMAGE_SIZE,
              borderRadius: radius.xl,
              overflow: 'hidden',
              backgroundColor: color.surfaceElevated,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {source ? (
              <Image
                source={source}
                style={{ width: IMAGE_SIZE, height: IMAGE_SIZE }}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
                importantForAccessibility="no"
              />
            ) : (
              <Ionicons name="image-outline" size={40} color={color.textTertiary} />
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}
