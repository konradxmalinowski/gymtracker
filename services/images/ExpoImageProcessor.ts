import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { ImageProcessor, ProcessedImage } from './ImageProcessor';

/**
 * `ImageProcessor` over the real, currently-installed `expo-image-manipulator`
 * (`~57.0.12`) API - SDK 57's context-based, chainable
 * `ImageManipulator.manipulate(uri).<action>().renderAsync()` -> `.saveAsync()`
 * shape, not the deprecated `manipulateAsync()` free function.
 *
 * Both methods below need the source image's own width/height before they can
 * compute a correct `resize`/`crop` rectangle (an aspect-preserving "fit" or a
 * center square needs the real dimensions, not a guess), and this API has no
 * separate "get image info" call - `renderAsync()` with zero scheduled actions
 * is the sanctioned way to load the image and read its `ImageRef.width`/
 * `.height`. `ImageManipulatorContext.reset()` then rewinds the same loaded
 * context back to the original image so the real transform can be scheduled
 * on it, rather than reloading the source URI a second time via a fresh
 * `manipulate()` call.
 */
export class ExpoImageProcessor implements ImageProcessor {
  async resizeToFit(
    sourceUri: string,
    maxLongEdge: number,
    quality: number,
  ): Promise<ProcessedImage> {
    const context = ImageManipulator.manipulate(sourceUri);
    const original = await context.renderAsync();

    const resizeOptions =
      original.width >= original.height
        ? { width: Math.min(original.width, maxLongEdge) }
        : { height: Math.min(original.height, maxLongEdge) };

    const resized = await context.reset().resize(resizeOptions).renderAsync();
    const saved = await resized.saveAsync({ compress: quality, format: SaveFormat.JPEG });
    return { uri: saved.uri, width: saved.width, height: saved.height };
  }

  async cropToSquareThumbnail(
    sourceUri: string,
    size: number,
    quality: number,
  ): Promise<ProcessedImage> {
    const context = ImageManipulator.manipulate(sourceUri);
    const original = await context.renderAsync();

    const shortEdge = Math.min(original.width, original.height);
    const originX = Math.round((original.width - shortEdge) / 2);
    const originY = Math.round((original.height - shortEdge) / 2);

    const cropped = await context
      .reset()
      .crop({ originX, originY, width: shortEdge, height: shortEdge })
      .resize({ width: size, height: size })
      .renderAsync();
    const saved = await cropped.saveAsync({ compress: quality, format: SaveFormat.JPEG });
    return { uri: saved.uri, width: saved.width, height: saved.height };
  }
}
