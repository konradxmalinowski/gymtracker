import { MmkvStore } from './MmkvStore';

export type { KvKey, KvSchema } from './schema';
export type { KvStore } from './KvStore';
export { MmkvStore } from './MmkvStore';

/**
 * The single shared `KvStore` instance for the app (ADR-0008: "imported
 * directly wherever it's needed rather than injected through [the
 * container]"). `MmkvStore`'s constructor is cheap - it opens/reuses the
 * native MMKV instance keyed by `id` - so a plain module-level singleton is
 * enough; there is no per-request or per-test lifecycle to manage the way
 * `AppContainer` has for SQLite.
 */
export const kv = new MmkvStore();
