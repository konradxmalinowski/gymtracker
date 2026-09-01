import { ExpoImageProcessor } from './ExpoImageProcessor';
import type { ImageProcessor } from './ImageProcessor';

export type { ImageProcessor, ProcessedImage } from './ImageProcessor';
export { ExpoImageProcessor } from './ExpoImageProcessor';

export function createImageProcessor(): ImageProcessor {
  return new ExpoImageProcessor();
}
