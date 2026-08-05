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
 * `crypto.getRandomValues` is available globally both on device (Hermes has
 * shipped it since React Native 0.72) and under Node/Jest (Node's Web Crypto
 * global, stable since Node 19) - no extra polyfill dependency needed.
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
  crypto.getRandomValues(bytes);
  return bytes;
}
