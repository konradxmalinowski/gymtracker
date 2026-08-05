import type { Clock } from './Clock';
import { computeLocalDate, computeTimezoneOffsetMinutes } from './localDate';

/** Production `Clock` - real wall-clock time, real runtime timezone. */
export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }

  localDate(at: number = this.now()): string {
    return computeLocalDate(at);
  }

  timezoneOffsetMinutes(at: number = this.now()): number {
    return computeTimezoneOffsetMinutes(at);
  }
}
