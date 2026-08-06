/**
 * Public entry point for resolving a bundled exercise image by the bare
 * filename the exercise catalog stores in its `images` array
 * (`assets/data/exercises.catalog.json`, e.g. `"26e9975d65f43036.webp"`).
 *
 * Feature code should import `getExerciseImageSource` from here rather than
 * reaching into the generated `imageMap.ts` directly - this file is the stable,
 * hand-written surface; `imageMap.ts` is regenerated wholesale by
 * `scripts/build-exercise-image-map.ts` whenever the bundled image set changes.
 */
import type { ImageSourcePropType } from 'react-native';

import { exerciseImageMap } from './imageMap';

/**
 * Resolves a catalog image filename to a React Native `Image`/`ImageBackground`
 * `source` value. Returns `undefined` for a missing/unknown filename (e.g. a
 * stale catalog entry, or `exercise.images[0]` on an exercise with no images)
 * so callers can fall back to a placeholder rather than crash.
 */
export function getExerciseImageSource(
  filename: string | null | undefined,
): ImageSourcePropType | undefined {
  if (!filename) return undefined;
  return exerciseImageMap[filename];
}

export { exerciseImageMap } from './imageMap';
