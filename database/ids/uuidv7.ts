/**
 * Minimal UUIDv7 generator (RFC 9562) for schema-layer tests, the catalog seeder's
 * default dependency, and `scripts/generate-perf-fixture.ts`.
 *
 * This is deliberately NOT the app-wide `IdGenerator` service (`services/id`,
 * ARCHITECTURE.md section 9 / 8.4) - that is a later step's own file, injected into
 * repositories via `AppContainer`. This one exists so `database/**` code that needs
 * a UUIDv7-shaped id (seed data, fixtures, tests exercising real primary keys) does
 * not have to depend on a service that does not exist yet, per ADR-0002 decision 1
 * (time-ordered `TEXT` primary keys, generated on the client). Uses `Math.random()`,
 * not a CSPRNG - adequate for fixtures/tests; the production service is free to make
 * a different call.
 */
export function generateUuidV7(now: number = Date.now()): string {
  const bytes = new Uint8Array(16);

  const timestamp = BigInt(Math.max(0, Math.floor(now)));
  bytes[0] = Number((timestamp >> 40n) & 0xffn);
  bytes[1] = Number((timestamp >> 32n) & 0xffn);
  bytes[2] = Number((timestamp >> 24n) & 0xffn);
  bytes[3] = Number((timestamp >> 16n) & 0xffn);
  bytes[4] = Number((timestamp >> 8n) & 0xffn);
  bytes[5] = Number(timestamp & 0xffn);

  for (let i = 6; i < 16; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }

  // Version 7 in the top 4 bits of byte 6.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  // Variant (10xxxxxx) in the top 2 bits of byte 8.
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
