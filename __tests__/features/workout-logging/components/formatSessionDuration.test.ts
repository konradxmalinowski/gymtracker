import { formatSessionDurationSeconds } from '@/features/workout-logging/components/formatSessionDuration';

describe('formatSessionDurationSeconds', () => {
  it('formats sub-hour durations as m:ss', () => {
    expect(formatSessionDurationSeconds(0)).toBe('0:00');
    expect(formatSessionDurationSeconds(5)).toBe('0:05');
    expect(formatSessionDurationSeconds(65)).toBe('1:05');
    expect(formatSessionDurationSeconds(599)).toBe('9:59');
  });

  it('switches to h:mm:ss once the duration reaches a full hour', () => {
    expect(formatSessionDurationSeconds(3600)).toBe('1:00:00');
    expect(formatSessionDurationSeconds(3661)).toBe('1:01:01');
    expect(formatSessionDurationSeconds(7325)).toBe('2:02:05');
  });

  it('floors a fractional number of seconds rather than rounding', () => {
    expect(formatSessionDurationSeconds(59.9)).toBe('0:59');
    expect(formatSessionDurationSeconds(3599.9)).toBe('59:59');
  });

  it('clamps a negative duration to zero rather than rendering a negative time', () => {
    expect(formatSessionDurationSeconds(-1)).toBe('0:00');
    expect(formatSessionDurationSeconds(-3600)).toBe('0:00');
  });
});
