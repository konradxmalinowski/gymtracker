import { ExpoFileStorage } from '@/services/files';

/**
 * Each test uses its own random subdirectory so tests never collide, since
 * `jest-expo`'s mock filesystem (`expo-file-system/mocks/FileSystem.ts`) is a
 * single in-memory store shared for the lifetime of this test file's module
 * registry.
 */
function uniqueDir(): string {
  return `t-${Math.random().toString(36).slice(2)}`;
}

describe('ExpoFileStorage', () => {
  it('exists() is false for a file that was never written', async () => {
    const storage = new ExpoFileStorage('document');
    expect(await storage.exists(`${uniqueDir()}/missing.txt`)).toBe(false);
  });

  it('writeText() then readText() round-trips, creating intermediate directories', async () => {
    const storage = new ExpoFileStorage('document');
    const path = `${uniqueDir()}/nested/file.txt`;

    await storage.writeText(path, 'hello');
    expect(await storage.exists(path)).toBe(true);
    expect(await storage.readText(path)).toBe('hello');
  });

  it('writeText() overwrites existing content rather than appending', async () => {
    const storage = new ExpoFileStorage('document');
    const path = `${uniqueDir()}/overwrite.txt`;

    await storage.writeText(path, 'first');
    await storage.writeText(path, 'second');
    expect(await storage.readText(path)).toBe('second');
  });

  it('appendText() adds to existing content', async () => {
    const storage = new ExpoFileStorage('document');
    const path = `${uniqueDir()}/append.txt`;

    await storage.appendText(path, 'a');
    await storage.appendText(path, 'b');
    expect(await storage.readText(path)).toBe('ab');
  });

  it('readText() returns null for a missing file', async () => {
    const storage = new ExpoFileStorage('document');
    expect(await storage.readText(`${uniqueDir()}/nope.txt`)).toBeNull();
  });

  it('writeBytes()/readBytes() round-trip binary content', async () => {
    const storage = new ExpoFileStorage('cache');
    const path = `${uniqueDir()}/blob.bin`;
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);

    await storage.writeBytes(path, bytes);
    const readBack = await storage.readBytes(path);
    expect(readBack).toEqual(bytes);
  });

  it('delete() removes a file and is a no-op when the file does not exist', async () => {
    const storage = new ExpoFileStorage('document');
    const path = `${uniqueDir()}/to-delete.txt`;

    await storage.writeText(path, 'x');
    expect(await storage.exists(path)).toBe(true);
    await storage.delete(path);
    expect(await storage.exists(path)).toBe(false);

    await expect(storage.delete(path)).resolves.toBeUndefined();
  });

  it('size() reports byte length and null for a missing file', async () => {
    const storage = new ExpoFileStorage('document');
    const path = `${uniqueDir()}/sized.txt`;

    expect(await storage.size(path)).toBeNull();
    await storage.writeText(path, '12345');
    expect(await storage.size(path)).toBe(5);
  });

  it('getUri() composes a relative path without touching disk', () => {
    const storage = new ExpoFileStorage('document');
    const uri = storage.getUri('some/relative/name.txt');
    expect(uri.endsWith('some/relative/name.txt')).toBe(true);
  });

  it('ensureDirectory() creates a directory that did not exist, idempotently', async () => {
    const storage = new ExpoFileStorage('document');
    const dir = `${uniqueDir()}/created-dir`;

    await storage.ensureDirectory(dir);
    await expect(storage.ensureDirectory(dir)).resolves.toBeUndefined();

    const path = `${dir}/inside.txt`;
    await storage.writeText(path, 'ok');
    expect(await storage.readText(path)).toBe('ok');
  });

  it('document and cache roots are independent', async () => {
    const documentStorage = new ExpoFileStorage('document');
    const cacheStorage = new ExpoFileStorage('cache');
    const path = `${uniqueDir()}/only-in-document.txt`;

    await documentStorage.writeText(path, 'doc');
    expect(await cacheStorage.exists(path)).toBe(false);
  });
});
