/**
 * Composition root and `ContainerProvider` - ARCHITECTURE.md section 8.4.
 *
 * `AppContainer` here is intentionally smaller than the full shape shown in
 * ARCHITECTURE.md 8.4 (`exercises`, `plans`, `sessions`, `history`, `records`,
 * `stats`, `body`, `photos`, `profile`, `notifications`). Those repositories
 * don't exist yet - they land one at a time in P4 (exercise-library) through
 * P14 (data-transfer). Declaring them here now, with no implementation behind
 * them, is exactly the "placeholder code" / "dead scaffolding" ADR-0004 forbids
 * ("never create placeholder code... never leave TODOs"). Each later feature
 * phase is expected to **extend** this interface (add its own member) as it
 * builds its repository, not replace it - `AppContainer` only ever grows.
 *
 * `kv` (`services/kv`) is deliberately not a container member either: per
 * ADR-0008, MMKV holds boot-critical flags that must be readable *before* the
 * database opens and the container exists (the splash gate), so it is imported
 * directly wherever it's needed rather than injected through here.
 */
import { createElement, createContext, useContext, type ReactNode } from 'react';
import { ProfileService } from '@/features/profile';
import { SqliteProfileRepository } from '@/features/profile/repository/SqliteProfileRepository';
import type { ProfileRepository } from '@/features/profile/repository/ProfileRepository';
import type { DatabaseContext } from '@/repositories/contracts/database';
import { SqliteSettingsRepository, type SettingsRepository } from '@/repositories/settings';
import { SystemClock, type Clock } from '@/services/clock';
import { createFileStorage, type FileStorage } from '@/services/files';
import { Uuid7IdGenerator, type IdGenerator } from '@/services/id';
import { createLogger, type Logger } from '@/services/logging';

export interface AppContainer {
  db: DatabaseContext;
  settings: SettingsRepository;
  files: FileStorage;
  logging: Logger;
  clock: Clock;
  idGenerator: IdGenerator;
  /** Feature repository, P3 (onboarding/profile/settings). Not re-exported for presentation use - go through `profileService`. */
  profileRepository: ProfileRepository;
  /** ARCHITECTURE.md section 3.1 rule 3: the only door into `profileRepository` for hooks/screens. */
  profileService: ProfileService;
}

export function createContainer(db: DatabaseContext, deps?: Partial<AppContainer>): AppContainer {
  const clock = deps?.clock ?? new SystemClock();
  const idGenerator = deps?.idGenerator ?? new Uuid7IdGenerator(clock);
  const files = deps?.files ?? createFileStorage('document');
  const logging = deps?.logging ?? createLogger({ fileStorage: createFileStorage('cache') });
  const settings = deps?.settings ?? new SqliteSettingsRepository(db, clock);
  const profileRepository = deps?.profileRepository ?? new SqliteProfileRepository(db, clock);
  const profileService =
    deps?.profileService ??
    new ProfileService({ repository: profileRepository, files, idGenerator, logging });

  return {
    db,
    clock,
    idGenerator,
    files,
    logging,
    settings,
    profileRepository,
    profileService,
  };
}

const ContainerContext = createContext<AppContainer | null>(null);

export interface ContainerProviderProps {
  container: AppContainer;
  children: ReactNode;
}

export function ContainerProvider({ container, children }: ContainerProviderProps) {
  return createElement(ContainerContext.Provider, { value: container }, children);
}

export function useContainer(): AppContainer {
  const container = useContext(ContainerContext);
  if (!container) {
    throw new Error('useContainer() must be called within a <ContainerProvider>.');
  }
  return container;
}
