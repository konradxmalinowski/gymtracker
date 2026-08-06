import { isHapticsEnabled, __setHapticsEnabledForTesting } from '@/services/haptics/settings';
import { kv } from '@/services/kv';

describe('services/haptics/settings', () => {
  afterEach(() => {
    kv.delete('haptics.enabled');
  });

  it('defaults to enabled when the MMKV mirror has never been written', () => {
    expect(isHapticsEnabled()).toBe(true);
  });

  it('reads the live MMKV mirror value (ADR-0008)', () => {
    kv.set('haptics.enabled', false);
    expect(isHapticsEnabled()).toBe(false);

    kv.set('haptics.enabled', true);
    expect(isHapticsEnabled()).toBe(true);
  });

  it('__setHapticsEnabledForTesting writes through the same mirror isHapticsEnabled reads', () => {
    __setHapticsEnabledForTesting(false);
    expect(isHapticsEnabled()).toBe(false);
  });
});
