import { formatRestSeconds } from '@/features/rest-timer/components/formatRestSeconds';

describe('formatRestSeconds', () => {
  it('formats under a minute as 0:ss', () => {
    expect(formatRestSeconds(0)).toBe('0:00');
    expect(formatRestSeconds(5)).toBe('0:05');
    expect(formatRestSeconds(59)).toBe('0:59');
  });

  it('formats a minute and above as m:ss', () => {
    expect(formatRestSeconds(60)).toBe('1:00');
    expect(formatRestSeconds(90)).toBe('1:30');
    expect(formatRestSeconds(1800)).toBe('30:00');
  });

  it('floors fractional seconds and clamps negative input to zero', () => {
    expect(formatRestSeconds(89.9)).toBe('1:29');
    expect(formatRestSeconds(-5)).toBe('0:00');
  });
});
