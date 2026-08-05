/**
 * `FileStorage` - ARCHITECTURE.md section 9 ("FileStorage over Expo FileSystem")
 * and section 7.8's relative-filename convention: a table column stores a
 * relative name only (e.g. `progress_photo.file_name`,
 * `user_profile.avatar_file_name`), never an absolute URI, because iOS changes
 * the application container UUID on every update and a persisted absolute
 * `file:///.../Application/<uuid>/...` path dangles after the next update. This
 * service is the one place that composes a relative name with a root directory
 * at read/write time.
 *
 * Deliberately generic, not photo- or avatar-specific: this phase builds the
 * primitive; progress photos (P13) and the avatar (P3) are later features that
 * call it.
 */
export type FileStorageRoot = 'document' | 'cache';

export interface FileStorage {
  /** Which root this instance is scoped to - `documentDirectory` or `cacheDirectory`. */
  readonly root: FileStorageRoot;

  /** Composes a relative path into an absolute `file://` URI, without touching disk. */
  getUri(relativePath: string): string;

  exists(relativePath: string): Promise<boolean>;

  /** `null` when the file does not exist. */
  readText(relativePath: string): Promise<string | null>;
  /** Creates the file (and any missing intermediate directories) if needed, then overwrites its content. */
  writeText(relativePath: string, content: string): Promise<void>;
  /** Creates the file (and any missing intermediate directories) if needed, then appends to its content. */
  appendText(relativePath: string, content: string): Promise<void>;

  /** `null` when the file does not exist. */
  readBytes(relativePath: string): Promise<Uint8Array | null>;
  /** Creates the file (and any missing intermediate directories) if needed, then overwrites its content. */
  writeBytes(relativePath: string, bytes: Uint8Array): Promise<void>;

  /** No-op when the file does not exist. */
  delete(relativePath: string): Promise<void>;

  /** `null` when the file does not exist. */
  size(relativePath: string): Promise<number | null>;

  /** Creates the directory (and any missing intermediate directories) if it does not already exist. */
  ensureDirectory(relativePath: string): Promise<void>;
}
