/**
 * services/haptics/settings.ts
 *
 * The haptics-enabled read `services/haptics/haptics.ts` guards every call
 * on. P3 (onboarding/profile/settings) adds the real `haptics.enabled`
 * setting - `SqliteSettingsRepository` owns it as the source of truth, MMKV
 * carries the synchronous mirror (ADR-0008's "MMKV key inventory": "the
 * unit and haptics mirrors exist so that presentation code can read them
 * synchronously during render without an async settings query"). Haptics
 * calls happen from gesture/press handlers, which cannot await an async
 * settings read, so this module reads the MMKV mirror directly rather than
 * `container.settings` - the same reason `services/haptics` isn't a
 * container member at all.
 *
 * The mirror is written by `features/profile`'s haptics-toggle mutation and
 * re-synced from SQLite on app boot (`app/_layout.tsx`); this module only
 * ever reads it.
 */
import { kv } from '@/services/kv';

export function isHapticsEnabled(): boolean {
  return kv.get('haptics.enabled') ?? true;
}

/**
 * Test-only escape hatch so unit tests can exercise the disabled path
 * without going through a real settings write. Not part of the public
 * `services/haptics` API surface (not re-exported from index.ts).
 */
export function __setHapticsEnabledForTesting(enabled: boolean): void {
  kv.set('haptics.enabled', enabled);
}
