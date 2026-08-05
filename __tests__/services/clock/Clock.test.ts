import { FixedClock } from '@/services/clock/FixedClock';
import { SystemClock } from '@/services/clock/SystemClock';

describe('SystemClock', () => {
  it('now() returns the real current time', () => {
    const clock = new SystemClock();
    const before = Date.now();
    const value = clock.now();
    const after = Date.now();
    expect(value).toBeGreaterThanOrEqual(before);
    expect(value).toBeLessThanOrEqual(after);
  });

  it('localDate() formats an explicit instant as YYYY-MM-DD', () => {
    const clock = new SystemClock();
    const noonUtc = Date.UTC(2026, 5, 15, 12, 0, 0);
    expect(clock.localDate(noonUtc)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('FixedClock', () => {
  it('now() returns the constructor value until advanced', () => {
    const clock = new FixedClock(1_000);
    expect(clock.now()).toBe(1_000);
    expect(clock.now()).toBe(1_000);
  });

  it('advance() moves the clock forward by the given delta', () => {
    const clock = new FixedClock(1_000);
    clock.advance(500);
    expect(clock.now()).toBe(1_500);
    clock.advance(-200);
    expect(clock.now()).toBe(1_300);
  });

  it('set() jumps to an absolute instant', () => {
    const clock = new FixedClock(0);
    clock.set(42_000);
    expect(clock.now()).toBe(42_000);
  });

  it('localDate() and timezoneOffsetMinutes() default to now()', () => {
    const noonUtc = Date.UTC(2026, 5, 15, 12, 0, 0);
    const clock = new FixedClock(noonUtc);
    expect(clock.localDate()).toBe(clock.localDate(noonUtc));
    expect(clock.timezoneOffsetMinutes()).toBe(clock.timezoneOffsetMinutes(noonUtc));
  });
});

describe('local_date across a timezone boundary (ADR-0002 decision 2)', () => {
  // `process.env.TZ` is not honored reliably by `Date` inside this project's
  // Jest environment (`jest-environment-node` runs each test file in its own
  // VM realm, and repeated env mutations within a run were observed not to
  // re-resolve the ICU timezone - confirmed empirically, not assumed). Rather
  // than depend on that (and on the host/CI runner's actual configured
  // timezone, which would make "differs from UTC" vacuous whenever that
  // happens to be UTC), these tests mock `Date.prototype`'s local getters
  // directly. That proves the actual thing ADR-0002 cares about - that
  // `localDate`/`timezoneOffsetMinutes` read the runtime's *local* calendar
  // fields, never `getUTC*`/`toISOString` - deterministically, on any machine.
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses local calendar fields, not a naive UTC slice - the exact "22:00 workout in UTC+2 lands on the previous day" failure mode', () => {
    const instant = Date.UTC(2026, 0, 1, 23, 30, 0); // 2026-01-01T23:30:00Z

    // Simulate a device timezone where this instant has already rolled over
    // to the next local day (e.g. UTC+14).
    jest.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026);
    jest.spyOn(Date.prototype, 'getMonth').mockReturnValue(0);
    jest.spyOn(Date.prototype, 'getDate').mockReturnValue(2);

    const clock = new SystemClock();
    expect(clock.localDate(instant)).toBe('2026-01-02');

    // `toISOString` is a native builtin that does not go through the
    // (mocked) public getters, so this is the real, unaffected UTC date -
    // proof the two genuinely disagree and `localDate` picked the local one.
    expect(new Date(instant).toISOString().slice(0, 10)).toBe('2026-01-01');
  });

  it('timezoneOffsetMinutes negates Date.getTimezoneOffset() (positive east of UTC, per the sign convention documented on Clock)', () => {
    jest.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-840); // UTC+14, JS's own sign convention
    const eastClock = new SystemClock();
    expect(eastClock.timezoneOffsetMinutes(Date.UTC(2026, 0, 1))).toBe(840);

    jest.restoreAllMocks();
    jest.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(300); // UTC-5
    const westClock = new SystemClock();
    expect(westClock.timezoneOffsetMinutes(Date.UTC(2026, 0, 1))).toBe(-300);
  });
});
