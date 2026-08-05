import { renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { createTestDatabase } from '@/database/node/createTestDatabase';
import {
  ContainerProvider,
  createContainer,
  useContainer,
  type AppContainer,
} from '@/services/container';
import { FixedClock } from '@/services/clock';
import type { IdGenerator } from '@/services/id';

describe('createContainer', () => {
  it('wires real default implementations for every member', () => {
    const db = createTestDatabase();
    const container = createContainer(db);

    expect(container.db).toBe(db);
    expect(container.clock).toBeDefined();
    expect(container.idGenerator).toBeDefined();
    expect(container.files).toBeDefined();
    expect(container.logging).toBeDefined();
    expect(container.settings).toBeDefined();

    expect(typeof container.clock.now()).toBe('number');
    expect(typeof container.idGenerator.generate()).toBe('string');
  });

  it('lets a caller override any dependency (test containers use this for a frozen Clock and deterministic ids)', async () => {
    const db = createTestDatabase();
    const clock = new FixedClock(12_345);
    const idGenerator: IdGenerator = { generate: () => 'fixed-id' };

    const container = createContainer(db, { clock, idGenerator });

    expect(container.clock).toBe(clock);
    expect(container.idGenerator).toBe(idGenerator);
    expect(container.idGenerator.generate()).toBe('fixed-id');

    // The overridden clock is actually used downstream (SettingsRepository reads it for updated_at).
    await container.settings.set('timer.defaultRestSeconds', 60);
    const row = await db.selectOne<{ updated_at: number }>(
      'SELECT updated_at FROM app_setting WHERE key = ?',
      ['timer.defaultRestSeconds'],
    );
    expect(row?.updated_at).toBe(12_345);
  });

  it('an overridden settings repository is used as-is, not wrapped', () => {
    const db = createTestDatabase();
    const fakeSettings = { get: jest.fn(), set: jest.fn() } as unknown as AppContainer['settings'];

    const container = createContainer(db, { settings: fakeSettings });
    expect(container.settings).toBe(fakeSettings);
  });
});

describe('ContainerProvider / useContainer', () => {
  it('exposes the provided container to descendants', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ContainerProvider container={container}>{children}</ContainerProvider>
    );

    const { result } = await renderHook(() => useContainer(), { wrapper });
    expect(result.current).toBe(container);
  });

  it('throws when called outside a ContainerProvider', async () => {
    const { result } = await renderHook(() => {
      try {
        return useContainer();
      } catch (error) {
        return error;
      }
    });
    expect(result.current).toBeInstanceOf(Error);
  });
});
