import { createMMKV, type MMKV } from 'react-native-mmkv';
import type { KvStore } from './KvStore';
import type { KvKey, KvSchema } from './schema';

const INSTANCE_ID = 'gymtracker';

/**
 * `react-native-mmkv` v4's native value types are `boolean | string | number |
 * ArrayBuffer` - `KvSchema` mixes booleans and strings across different keys, so
 * every value is JSON-encoded into a single MMKV string slot rather than picking
 * a different native getter per key. This costs a few bytes of quoting; it buys a
 * single, uniform read/write path and a corrupt-value story (`JSON.parse`
 * throwing) that is trivial to catch, instead of the caller having to know which
 * of `getString`/`getBoolean`/`getNumber` a given key needs.
 *
 * `createMMKV()` auto-detects the Jest/test environment and returns
 * `react-native-mmkv`'s own in-memory mock (see `createMockMMKV.ts`), so this
 * class needs no separate test double.
 */
export class MmkvStore implements KvStore {
  private readonly mmkv: MMKV;

  constructor(instanceId: string = INSTANCE_ID) {
    this.mmkv = createMMKV({ id: instanceId });
  }

  get<K extends KvKey>(key: K): KvSchema[K] | undefined {
    const raw = this.mmkv.getString(key);
    if (raw === undefined) {
      return undefined;
    }
    try {
      return JSON.parse(raw) as KvSchema[K];
    } catch {
      // A corrupt MMKV entry must never crash a boot-critical read - treat it
      // the same as "never written".
      return undefined;
    }
  }

  set<K extends KvKey>(key: K, value: KvSchema[K]): void {
    this.mmkv.set(key, JSON.stringify(value));
  }

  delete(key: KvKey): void {
    this.mmkv.remove(key);
  }

  contains(key: KvKey): boolean {
    return this.mmkv.contains(key);
  }
}
