/**
 * `ImageProcessor` - the one interface `ProgressPhotoService` (P13, body-metrics)
 * talks to for real image resizing/cropping, mirroring how `FileStorage` confines
 * `expo-file-system` to a single implementation file: no other module should
 * import `expo-image-manipulator` directly. This is what makes
 * `ProgressPhotoService` unit-testable with a fake `ImageProcessor`, the same
 * DI-everywhere convention every other feature service in this codebase follows.
 *
 * ADR-0012 shapes: full image capped at 1600px long edge JPEG q80, thumbnail
 * 240x240 square center-crop JPEG q70 - `ProgressPhotoService.addPhoto` is the
 * caller that applies those concrete numbers; this interface itself is generic.
 */
export interface ProcessedImage {
  /** `file://` URI of the processed output (typically in the cache directory). */
  uri: string;
  width: number;
  height: number;
}

export interface ImageProcessor {
  /**
   * Resizes so the long edge is at most `maxLongEdge` px, preserving aspect
   * ratio (never upscales past the source's own dimensions), re-encoded as
   * JPEG at `quality` (0-1).
   */
  resizeToFit(sourceUri: string, maxLongEdge: number, quality: number): Promise<ProcessedImage>;

  /**
   * Center-crops to a square (the shorter of width/height), then resizes to
   * `size`x`size`, re-encoded as JPEG at `quality` (0-1).
   */
  cropToSquareThumbnail(sourceUri: string, size: number, quality: number): Promise<ProcessedImage>;
}
