/**
 * services/haptics/settings.ts
 *
 * The haptics-enabled toggle is a P15 (settings) feature that does not exist
 * yet (CLAUDE.md: "P15 (settings)... is the only place [user preferences are
 * surfaced]"). `services/haptics` still has to honor a haptics-enabled
 * setting today per ARCHITECTURE.md section 11.6 ("All of them are no-ops
 * when the user disables haptics in settings"), so this module is a
 * provisional, typed stand-in: a settings-shaped read with an in-memory
 * default, not a settings feature. When P15 lands, it swaps this module's
 * body for a real MMKV-backed read (`services/kv`) without changing
 * `services/haptics/haptics.ts`'s call sites - `isHapticsEnabled()` is the
 * seam.
 */

let hapticsEnabled = true;

/** Provisional in-memory default (see file header). Always `true` until P15. */
export function isHapticsEnabled(): boolean {
  return hapticsEnabled;
}

/**
 * Test-only escape hatch so gallery/unit tests can exercise the disabled
 * path without a real settings store. Not part of the public
 * `services/haptics` API surface (not re-exported from index.ts).
 */
export function __setHapticsEnabledForTesting(enabled: boolean): void {
  hapticsEnabled = enabled;
}
