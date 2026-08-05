import type { KvKey, KvSchema } from './schema';

/**
 * Typed MMKV wrapper - ARCHITECTURE.md section 9 ("MMKV wrapper with typed
 * keys") / ADR-0008. Every read/write is keyed by `KvKey`, so a typo or a
 * retired key is a compile error rather than a silent `undefined` at runtime -
 * "no string literals at call sites" per the ADR.
 */
export interface KvStore {
  /** `undefined` when the key has never been written. */
  get<K extends KvKey>(key: K): KvSchema[K] | undefined;
  set<K extends KvKey>(key: K, value: KvSchema[K]): void;
  delete(key: KvKey): void;
  contains(key: KvKey): boolean;
}
