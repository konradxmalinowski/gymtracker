import type { Clock } from './Clock';
import { computeLocalDate, computeTimezoneOffsetMinutes } from './localDate';

/**
 * Test-only `Clock` - ARCHITECTURE.md section 8.4: "Tests build a container over
 * an in-memory `better-sqlite3` executor with a frozen `Clock`". Not gated behind
 * `__DEV__` or a test-only export list because it has no side effects and no
 * production call site ever constructs one; it is simply never imported outside
 * `__tests__/**`.
 */
export class FixedClock implements Clock {
  private currentMs: number;

  constructor(initialMs: number) {
    this.currentMs = initialMs;
  }

  now(): number {
    return this.currentMs;
  }

  localDate(at: number = this.now()): string {
    return computeLocalDate(at);
  }

  timezoneOffsetMinutes(at: number = this.now()): number {
    return computeTimezoneOffsetMinutes(at);
  }

  /** Moves the clock forward (or backward, with a negative delta) by `ms`. */
  advance(ms: number): void {
    this.currentMs += ms;
  }

  /** Jumps the clock to an absolute instant. */
  set(ms: number): void {
    this.currentMs = ms;
  }
}
