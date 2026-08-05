import { MmkvStore } from '@/services/kv';

describe('MmkvStore', () => {
  it('round-trips a boolean value', () => {
    const store = new MmkvStore(`test-${Math.random()}`);
    expect(store.get('onboarding.completed')).toBeUndefined();
    store.set('onboarding.completed', true);
    expect(store.get('onboarding.completed')).toBe(true);
    store.set('onboarding.completed', false);
    expect(store.get('onboarding.completed')).toBe(false);
  });

  it('round-trips a string value', () => {
    const store = new MmkvStore(`test-${Math.random()}`);
    store.set('session.activeId', 'abc-123');
    expect(store.get('session.activeId')).toBe('abc-123');
  });

  it('round-trips a narrow string-union value', () => {
    const store = new MmkvStore(`test-${Math.random()}`);
    store.set('units.weight', 'lb');
    expect(store.get('units.weight')).toBe('lb');
  });

  it('contains() reflects whether a key has been written', () => {
    const store = new MmkvStore(`test-${Math.random()}`);
    expect(store.contains('haptics.enabled')).toBe(false);
    store.set('haptics.enabled', true);
    expect(store.contains('haptics.enabled')).toBe(true);
  });

  it('delete() removes a key', () => {
    const store = new MmkvStore(`test-${Math.random()}`);
    store.set('catalog.version', '3');
    expect(store.get('catalog.version')).toBe('3');
    store.delete('catalog.version');
    expect(store.get('catalog.version')).toBeUndefined();
    expect(store.contains('catalog.version')).toBe(false);
  });

  it('treats a corrupt stored value as "never written" rather than throwing', () => {
    const store = new MmkvStore(`test-${Math.random()}`);
    // Reach past the typed API to simulate a corrupt/foreign value in the slot.
    (store as unknown as { mmkv: { set: (k: string, v: string) => void } }).mmkv.set(
      'session.active',
      'not json{{',
    );
    expect(() => store.get('session.active')).not.toThrow();
    expect(store.get('session.active')).toBeUndefined();
  });

  it('different instance ids do not share state', () => {
    const a = new MmkvStore(`test-a-${Math.random()}`);
    const b = new MmkvStore(`test-b-${Math.random()}`);
    a.set('onboarding.completed', true);
    expect(b.get('onboarding.completed')).toBeUndefined();
  });
});
