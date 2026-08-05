import { FixedClock } from '@/services/clock';
import { Uuid7IdGenerator } from '@/services/id';

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('Uuid7IdGenerator', () => {
  it('generates ids matching the UUIDv7 shape (version 7, variant 10xx)', () => {
    const generator = new Uuid7IdGenerator();
    const id = generator.generate();
    expect(id).toMatch(UUID_V7_PATTERN);
  });

  it('generates unique ids across many calls', () => {
    const generator = new Uuid7IdGenerator();
    const ids = new Set(Array.from({ length: 1_000 }, () => generator.generate()));
    expect(ids.size).toBe(1_000);
  });

  it('encodes the clock instant into the leading 48 bits, so later ids sort after earlier ones', () => {
    const clock = new FixedClock(Date.UTC(2026, 0, 1));
    const generator = new Uuid7IdGenerator(clock);

    const earlier = generator.generate();
    clock.advance(60_000);
    const later = generator.generate();

    expect(earlier < later).toBe(true);
  });

  it('is fully deterministic when both the clock and the random source are injected (fixture reproducibility)', () => {
    const clock = new FixedClock(Date.UTC(2026, 0, 1));
    const randomBytes = (length: number) => new Uint8Array(length).fill(0xab);

    const generator = new Uuid7IdGenerator(clock, randomBytes);
    expect(generator.generate()).toBe(generator.generate());
  });

  it('defaults to the current time when no clock is injected', () => {
    const before = Date.now();
    const id = new Uuid7IdGenerator().generate();
    const after = Date.now();

    const timestampHex = id.slice(0, 8) + id.slice(9, 13);
    const timestampMs = parseInt(timestampHex, 16);
    expect(timestampMs).toBeGreaterThanOrEqual(before);
    expect(timestampMs).toBeLessThanOrEqual(after);
  });
});
