import type { Clock } from '@/services/clock';
import { SystemClock } from '@/services/clock';
import type { IdGenerator } from './IdGenerator';

/**
 * Production `IdGenerator` - RFC 9562 UUID version 7: a 48-bit big-endian
 * millisecond timestamp in the leading bytes (time-ordered, so `ORDER BY id`
 * approximates creation order and B-tree inserts stay append-mostly - ADR-0002
 * decision 1), followed by the version/variant bits, with the rest filled from a
 * cryptographically secure random source.
 *
 * This is an independent implementation from `database/ids/uuidv7.ts` (that one
 * is a schema-layer/fixture helper using `Math.random()`, explicitly not meant to
 * be this service - see its own header comment). Both happen to use the same bit
 * layout because that layout is the RFC, not a shared implementation: this one
 * uses `crypto.getRandomValues` for real entropy and reaches timestamp bytes via
 * successive integer division rather than `BigInt` shifts, and both the clock and
 * the random source are constructor-injectable so tests can make id generation
 * fully deterministic (ARCHITECTURE.md section 8.4: "injectable: makes fixtures
 * reproducible").
 *
 * `crypto.getRandomValues` is used when the runtime exposes it - true under
 * Node/Jest (Node's Web Crypto global, stable since Node 19), which is why
 * every prior phase's Jest-only verification never caught the gap below.
 *
 * On a real Android device it is **not** guaranteed: this project has no
 * `crypto.getRandomValues` polyfill anywhere in its dependency tree (no
 * `expo-crypto`/`react-native-get-random-values`/equivalent installed), and
 * this generator's `generate()` was, until the P12 Android bring-up session
 * that found this, the only production code path in the entire app that ever
 * called it - every other write path either uses a fixed literal id
 * (`user_profile`, see `SqliteProfileRepository`) or `database/ids/uuidv7.ts`'s
 * own separate `Math.random()`-based helper (catalog seeding). Confirmed via
 * static analysis (no such package installed, no polyfill import anywhere) as
 * the leading hypothesis for a 100%-reproducible "Could not start a workout"
 * failure on a fresh install's first "Quick Start" tap - the first moment
 * this method is ever called on-device - though this could not be confirmed
 * with a real device stack trace within this pass; see the P12 Android
 * bring-up notes. `getSecureRandomBytes` below now feature-detects and falls
 * back to `fillWithInsecureRandomBytes` rather than throwing either way, so
 * this is fixed regardless of whether that hypothesis turns out to be the
 * actual root cause.
 */
export class Uuid7IdGenerator implements IdGenerator {
  constructor(
    private readonly clock: Pick<Clock, 'now'> = new SystemClock(),
    private readonly randomBytes: (length: number) => Uint8Array = getSecureRandomBytes,
  ) {}

  generate(): string {
    const timestampMs = Math.max(0, Math.floor(this.clock.now()));
    const bytes = this.randomBytes(16);

    writeTimestamp48(bytes, timestampMs);

    // Version 7 in the high nibble of byte 6; variant `10xxxxxx` in the top two
    // bits of byte 8. Every other bit stays whatever the random source produced.
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

    return formatAsUuid(bytes);
  }
}

/** Writes `timestampMs` into `bytes[0..5]`, most significant byte first. */
function writeTimestamp48(bytes: Uint8Array, timestampMs: number): void {
  let remaining = timestampMs;
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = remaining % 256;
    remaining = Math.floor(remaining / 256);
  }
}

function formatAsUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getSecureRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  // Read through `globalThis` rather than the bare `crypto` identifier -
  // referencing an undeclared global identifier directly throws a
  // `ReferenceError` (uncatchable by an `?.` on the identifier itself),
  // whereas a property read off `globalThis` safely evaluates to `undefined`
  // whether or not the runtime ever declared a `crypto` global at all.
  const webCrypto = (
    globalThis as { crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array } }
  ).crypto;
  if (webCrypto?.getRandomValues) {
    webCrypto.getRandomValues(bytes);
    return bytes;
  }
  fillWithInsecureRandomBytes(bytes);
  return bytes;
}

/**
 * Fallback random source for a runtime with no Web Crypto global - see this
 * file's header comment for why this gap exists and why it is safe here.
 * Not cryptographically secure, deliberately: UUIDv7's leading 48 bits
 * already carry the id's required time-ordering (ADR-0002 decision 1), the
 * remaining bits only need to be collision-resistant, not unpredictable, and
 * this app is offline/single-local-user with these ids used purely as opaque
 * primary keys, never as security tokens.
 */
function fillWithInsecureRandomBytes(bytes: Uint8Array): void {
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
}
