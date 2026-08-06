import { Directory, File, Paths } from 'expo-file-system';
import type { FileStorage, FileStorageRoot } from './FileStorage';

function resolveRootDirectory(root: FileStorageRoot): Directory {
  return root === 'document' ? Paths.document : Paths.cache;
}

function pathSegments(relativePath: string): string[] {
  const segments = relativePath.split('/').filter((segment) => segment.length > 0);
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error(`Invalid relativePath "${relativePath}": traversal segments are not allowed.`);
  }
  return segments;
}

/**
 * `FileStorage` over the class-based `expo-file-system` API (`File`, `Directory`,
 * `Paths` - SDK 54+). `jest-expo`'s preset backs these classes with a real
 * in-memory filesystem under Jest (`expo-file-system/mocks/FileSystem.ts`), so
 * this class is exercised directly by tests, not mocked out.
 */
export class ExpoFileStorage implements FileStorage {
  readonly root: FileStorageRoot;
  private readonly rootDirectory: Directory;

  constructor(root: FileStorageRoot = 'document') {
    this.root = root;
    this.rootDirectory = resolveRootDirectory(root);
  }

  private file(relativePath: string): File {
    return new File(this.rootDirectory, ...pathSegments(relativePath));
  }

  private directory(relativePath: string): Directory {
    const segments = pathSegments(relativePath);
    return segments.length === 0
      ? this.rootDirectory
      : new Directory(this.rootDirectory, ...segments);
  }

  /** Creates the parent directory of `relativePath`, if it does not already exist. */
  private ensureParentDirectory(relativePath: string): void {
    const segments = pathSegments(relativePath);
    if (segments.length <= 1) {
      return;
    }
    const parent = new Directory(this.rootDirectory, ...segments.slice(0, -1));
    if (!parent.exists) {
      parent.create({ intermediates: true });
    }
  }

  getUri(relativePath: string): string {
    return this.file(relativePath).uri;
  }

  async exists(relativePath: string): Promise<boolean> {
    return this.file(relativePath).exists;
  }

  async readText(relativePath: string): Promise<string | null> {
    const file = this.file(relativePath);
    if (!file.exists) {
      return null;
    }
    return file.text();
  }

  async writeText(relativePath: string, content: string): Promise<void> {
    this.ensureParentDirectory(relativePath);
    const file = this.file(relativePath);
    if (!file.exists) {
      file.create({ intermediates: true });
    }
    file.write(content);
  }

  async appendText(relativePath: string, content: string): Promise<void> {
    this.ensureParentDirectory(relativePath);
    const file = this.file(relativePath);
    if (!file.exists) {
      file.create({ intermediates: true });
    }
    file.write(content, { append: true });
  }

  async readBytes(relativePath: string): Promise<Uint8Array | null> {
    const file = this.file(relativePath);
    if (!file.exists) {
      return null;
    }
    return file.bytes();
  }

  async writeBytes(relativePath: string, bytes: Uint8Array): Promise<void> {
    this.ensureParentDirectory(relativePath);
    const file = this.file(relativePath);
    if (!file.exists) {
      file.create({ intermediates: true });
    }
    file.write(bytes);
  }

  async copyFrom(sourceUri: string, relativePath: string): Promise<void> {
    this.ensureParentDirectory(relativePath);
    const source = new File(sourceUri);
    const destination = this.file(relativePath);
    await source.copy(destination, { overwrite: true });
  }

  async delete(relativePath: string): Promise<void> {
    const file = this.file(relativePath);
    if (file.exists) {
      file.delete();
    }
  }

  async size(relativePath: string): Promise<number | null> {
    const file = this.file(relativePath);
    return file.exists ? file.size : null;
  }

  async ensureDirectory(relativePath: string): Promise<void> {
    const dir = this.directory(relativePath);
    if (!dir.exists) {
      dir.create({ intermediates: true });
    }
  }
}

export function createFileStorage(root: FileStorageRoot = 'document'): FileStorage {
  return new ExpoFileStorage(root);
}
