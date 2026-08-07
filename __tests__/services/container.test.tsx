import { renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { createTestDatabase } from '@/database/node/createTestDatabase';
import { seedLookupTables } from '@/database/seed/lookupSeeder';
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
    expect(container.profileRepository).toBeDefined();
    expect(container.profileService).toBeDefined();
    expect(container.exerciseRepository).toBeDefined();
    expect(container.exerciseService).toBeDefined();
    expect(container.planRepository).toBeDefined();
    expect(container.planService).toBeDefined();
    expect(container.sessionRepository).toBeDefined();
    expect(container.sessionService).toBeDefined();

    expect(typeof container.clock.now()).toBe('number');
    expect(typeof container.idGenerator.generate()).toBe('string');
  });

  it('profileService is wired to profileRepository - a profile created through the service is visible through the repository directly', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);

    await container.profileService.completeOnboarding({ nickname: 'Konrad' });

    const viaRepository = await container.profileRepository.get();
    expect(viaRepository?.nickname).toBe('Konrad');
  });

  it('exerciseService is wired to exerciseRepository - a custom exercise created through the service is visible through the repository directly', async () => {
    const db = createTestDatabase();
    // `equipment`/`muscle` are lookup tables with FK-referenced slugs (ARCHITECTURE.md
    // section 7.4) - seeding them first mirrors `SqliteExerciseRepository.test.ts`'s
    // own `setup()` helper, not something `createTestDatabase()` does by itself.
    await seedLookupTables(db);
    const container = createContainer(db);

    const created = await container.exerciseService.createCustom({
      nameEn: 'Cable Crossover',
      equipmentSlug: 'cable',
      muscles: [{ slug: 'chest', role: 'primary' }],
    });

    const viaRepository = await container.exerciseRepository.findById(created.id);
    expect(viaRepository?.nameEn).toBe('Cable Crossover');
  });

  it('planService is wired to planRepository - a plan created through the service is visible through the repository directly', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);

    const created = await container.planService.createPlan({ name: 'Push Day' });

    const viaRepository = await container.planRepository.getPlan(created.id);
    expect(viaRepository?.name).toBe('Push Day');
  });

  it('sessionService is wired to sessionRepository - a workout started through the service is visible through the repository directly', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);

    const result = await container.sessionService.startEmpty(Date.UTC(2026, 7, 6, 18));

    expect(result.outcome).toBe('started');
    const viaRepository = await container.sessionRepository.findInProgress();
    expect(viaRepository?.id).toBe(result.outcome === 'started' ? result.session.id : undefined);
    expect(viaRepository?.status).toBe('in_progress');
  });

  it('sessionService reads workout.staleAfterHours through the container settings repository', async () => {
    const db = createTestDatabase();
    const container = createContainer(db);
    await container.settings.set('workout.staleAfterHours', 3);
    await container.sessionService.startEmpty(Date.UTC(2026, 7, 6, 18));

    const snapshot = await container.sessionService.findInProgress();

    expect(snapshot?.staleAfterHours).toBe(3);
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
