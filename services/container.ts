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
import { ExerciseService } from '@/features/exercise-library';
import { SqliteExerciseRepository } from '@/features/exercise-library/repository/SqliteExerciseRepository';
import type { ExerciseRepository } from '@/features/exercise-library/repository/ExerciseRepository';
import { PlanService } from '@/features/plans';
import { SqlitePlanRepository } from '@/features/plans/repository/SqlitePlanRepository';
import type { PlanRepository } from '@/features/plans/repository/PlanRepository';
import { WorkoutSessionService } from '@/features/workout-logging';
import { SqliteWorkoutSessionRepository } from '@/features/workout-logging/repository/SqliteWorkoutSessionRepository';
import type { WorkoutSessionRepository } from '@/features/workout-logging/repository/WorkoutSessionRepository';
import { SqliteExerciseHistoryRepository } from '@/features/workout-logging/repository/SqliteExerciseHistoryRepository';
import type { ExerciseHistoryRepository } from '@/features/workout-logging/repository/ExerciseHistoryRepository';
import { SqliteHomeDashboardRepository } from '@/features/home/repository/SqliteHomeDashboardRepository';
import type { HomeDashboardRepository } from '@/features/home/repository/HomeDashboardRepository';
import { SqliteStatisticsRepository } from '@/features/statistics/repository/SqliteStatisticsRepository';
import type { StatisticsRepository } from '@/features/statistics/repository/StatisticsRepository';
import { SqliteCalendarRepository } from '@/features/calendar/repository/SqliteCalendarRepository';
import type { CalendarRepository } from '@/features/calendar/repository/CalendarRepository';
import { PersonalRecordService } from '@/features/records';
import { SqlitePersonalRecordRepository } from '@/features/records/repository/SqlitePersonalRecordRepository';
import type { PersonalRecordRepository } from '@/features/records/repository/PersonalRecordRepository';
import { BodyMetricService, ProgressPhotoService } from '@/features/body-metrics';
import { SqliteBodyMetricRepository } from '@/features/body-metrics/repository/SqliteBodyMetricRepository';
import type { BodyMetricRepository } from '@/features/body-metrics/repository/BodyMetricRepository';
import { SqliteProgressPhotoRepository } from '@/features/body-metrics/repository/SqliteProgressPhotoRepository';
import type { ProgressPhotoRepository } from '@/features/body-metrics/repository/ProgressPhotoRepository';
import { DataTransferService } from '@/features/data-transfer/services/DataTransferService';
import { SqliteDataTransferRepository } from '@/features/data-transfer/repository/SqliteDataTransferRepository';
import type { DataTransferRepository } from '@/features/data-transfer/repository/DataTransferRepository';
import { DailyGoalService, DailyReminderService } from '@/features/daily-goals';
import { SqliteDailyGoalRepository } from '@/features/daily-goals/repository/SqliteDailyGoalRepository';
import type { DailyGoalRepository } from '@/features/daily-goals/repository/DailyGoalRepository';
import { SqliteDailyReminderRepository } from '@/features/daily-goals/repository/SqliteDailyReminderRepository';
import type { DailyReminderRepository } from '@/features/daily-goals/repository/DailyReminderRepository';
import type { DatabaseContext } from '@/repositories/contracts/database';
import { SqliteSettingsRepository, type SettingsRepository } from '@/repositories/settings';
import { SystemClock, type Clock } from '@/services/clock';
import { createFileStorage, type FileStorage } from '@/services/files';
import { Uuid7IdGenerator, type IdGenerator } from '@/services/id';
import { createImageProcessor, type ImageProcessor } from '@/services/images';
import { createLogger, type Logger } from '@/services/logging';
import {
  notificationScheduler,
  workoutReminderService,
  type NotificationScheduler,
  type WorkoutReminderService,
} from '@/services/notifications';

export interface AppContainer {
  db: DatabaseContext;
  settings: SettingsRepository;
  files: FileStorage;
  logging: Logger;
  clock: Clock;
  idGenerator: IdGenerator;
  /** Image resize/crop abstraction, P13 (body-metrics) - confines `expo-image-manipulator` to a single implementation, mirroring how `files` confines `expo-file-system`. Not feature-specific: a future feature could reuse it. */
  imageProcessor: ImageProcessor;
  /** Feature repository, P3 (onboarding/profile/settings). Not re-exported for presentation use - go through `profileService`. */
  profileRepository: ProfileRepository;
  /** ARCHITECTURE.md section 3.1 rule 3: the only door into `profileRepository` for hooks/screens. */
  profileService: ProfileService;
  /** Feature repository, P4 (exercise-library). Not re-exported for presentation use - go through `exerciseService`. */
  exerciseRepository: ExerciseRepository;
  /** ARCHITECTURE.md section 3.1 rule 3: the only door into `exerciseRepository` for hooks/screens. */
  exerciseService: ExerciseService;
  /** Feature repository, P5 (plans). Not re-exported for presentation use - go through `planService`. */
  planRepository: PlanRepository;
  /** ARCHITECTURE.md section 3.1 rule 3: the only door into `planRepository` for hooks/screens. */
  planService: PlanService;
  /** Feature repository, P6 (workout-logging) - the crash-safe active-workout write path (ADR-0005). Not re-exported for presentation use - go through `sessionService`. */
  sessionRepository: WorkoutSessionRepository;
  /** ARCHITECTURE.md section 3.1 rule 3: the only door into `sessionRepository` for hooks/screens. */
  sessionService: WorkoutSessionService;
  /** Feature repository, P8 (records) - the personal-record cache (ADR-0015 Decision 3). Not re-exported for presentation use - go through `recordService`. Also injected into `sessionRepository` so `completeSet` can evaluate records inside its own transaction. */
  recordRepository: PersonalRecordRepository;
  /** ARCHITECTURE.md section 3.1 rule 3: the only door into `recordRepository` for hooks/screens. */
  recordService: PersonalRecordService;
  /** Read model, P8 (workout-logging) - previous/best performance and recent session history for an exercise (ARCHITECTURE.md section 8.3). Read-only, so there is no accompanying service: it returns flat DTOs with nothing to validate, the same "no service layer" shape `StatisticsRepository` (a later phase) is expected to have. */
  exerciseHistoryRepository: ExerciseHistoryRepository;
  /** Read model, P10 (home) - lightweight, home-owned streak/weekly-summary/last-session/next-plan-day queries. P11 resolved `docs/adr/0019-home-dashboard-read-model.md`'s open migration note: Home keeps this permanently rather than migrating onto `statisticsRepository`, which never implements `streak()`/`weeklySummary()` at all (see that repository's own header comment). Read-only, no accompanying service - same shape as `exerciseHistoryRepository`. */
  homeDashboardRepository: HomeDashboardRepository;
  /** Read model, P11 (statistics) - volume/frequency/duration time series, muscle-group volume, per-exercise progression and the yearly heatmap, all as flat SQL-aggregated DTOs (ARCHITECTURE.md section 8.3). Read-only, no accompanying service - same shape as `exerciseHistoryRepository`/`homeDashboardRepository`. */
  statisticsRepository: StatisticsRepository;
  /** Read model, P12 (calendar) - month/year `v_session_summary` overviews for the calendar grid and yearly heatmap, as flat DTOs (`features/calendar/repository/CalendarRepository.ts`). Read-only, no accompanying service - same shape as `exerciseHistoryRepository`/`homeDashboardRepository`/`statisticsRepository`. */
  calendarRepository: CalendarRepository;
  /** Feature repository, P13 (body-metrics) - `body_metric_entry` (schema already shipped in P2). Not re-exported for presentation use - go through `bodyMetricService`. */
  bodyMetricRepository: BodyMetricRepository;
  /** ARCHITECTURE.md section 3.1 rule 3: the only door into `bodyMetricRepository` for hooks/screens. */
  bodyMetricService: BodyMetricService;
  /** Feature repository, P13 (body-metrics) - `progress_photo` (schema already shipped in P2). Not re-exported for presentation use - go through `progressPhotoService`. */
  progressPhotoRepository: ProgressPhotoRepository;
  /** ARCHITECTURE.md section 3.1 rule 3: the only door into `progressPhotoRepository` for hooks/screens. */
  progressPhotoService: ProgressPhotoService;
  /** Feature repository, P14 (data-transfer) - reads across virtually every table (ARCHITECTURE.md section 9.1: "depends on everything, built last"). Not re-exported for presentation use - go through `dataTransferService`. */
  dataTransferRepository: DataTransferRepository;
  /** ARCHITECTURE.md section 3.1 rule 3: the only door into `dataTransferRepository` for hooks/screens. */
  dataTransferService: DataTransferService;
  /** Gravitus-inspired refresh: local weekly workout reminders (`services/notifications/WorkoutReminderService.ts`) - a bare service with no repository, since nothing here is DB-backed beyond the `reminders.*` settings keys `RemindersSettingsScreen` already reads/writes directly through `settings`. The default is the shared singleton (no per-call `expo-notifications` state to isolate), overridable via `deps` the same way every other container member is for tests. */
  workoutReminderService: WorkoutReminderService;
  /** Feature repository, P17 (daily-goals) - `daily_goal`/`daily_goal_entry` (`database/schema.sql` section 7.12). Not re-exported for presentation use - go through `dailyGoalService`. */
  dailyGoalRepository: DailyGoalRepository;
  /** ARCHITECTURE.md section 3.1 rule 3: the only door into `dailyGoalRepository` for hooks/screens. */
  dailyGoalService: DailyGoalService;
  /** Feature repository, P17 (daily-goals) - `daily_reminder`/`daily_reminder_response`. Not re-exported for presentation use - go through `dailyReminderService`. */
  dailyReminderRepository: DailyReminderRepository;
  /** ARCHITECTURE.md section 3.1 rule 3: the only door into `dailyReminderRepository` for hooks/screens. */
  dailyReminderService: DailyReminderService;
  /**
   * ADR-0016: the shared `NotificationScheduler` section 8.4 has declared
   * since P0 and no phase had implemented until P17 - daily-goals is its
   * first real consumer. Distinct from `workoutReminderService` (its own,
   * separate, never-migrated wrapper - ADR-0016's documented "three
   * notification code paths" gap) and from `features/rest-timer/services/
   * RestTimerNotificationService.ts` (not a container member at all). The
   * default is the shared singleton (no per-call `expo-notifications` state
   * to isolate), overridable via `deps` the same way `workoutReminderService`
   * already is.
   */
  notifications: NotificationScheduler;
}

export function createContainer(db: DatabaseContext, deps?: Partial<AppContainer>): AppContainer {
  const clock = deps?.clock ?? new SystemClock();
  const idGenerator = deps?.idGenerator ?? new Uuid7IdGenerator(clock);
  const files = deps?.files ?? createFileStorage('document');
  const imageProcessor = deps?.imageProcessor ?? createImageProcessor();
  const logging = deps?.logging ?? createLogger({ fileStorage: createFileStorage('cache') });
  const settings = deps?.settings ?? new SqliteSettingsRepository(db, clock);
  const profileRepository = deps?.profileRepository ?? new SqliteProfileRepository(db, clock);
  const profileService =
    deps?.profileService ??
    new ProfileService({ repository: profileRepository, files, idGenerator, logging });
  const exerciseRepository =
    deps?.exerciseRepository ?? new SqliteExerciseRepository({ db, clock, idGenerator });
  const exerciseService =
    deps?.exerciseService ?? new ExerciseService({ repository: exerciseRepository, logging });
  const planRepository =
    deps?.planRepository ?? new SqlitePlanRepository({ db, clock, idGenerator });
  const planService = deps?.planService ?? new PlanService({ repository: planRepository });
  const recordRepository =
    deps?.recordRepository ??
    new SqlitePersonalRecordRepository({ db, clock, idGenerator, settings });
  const recordService =
    deps?.recordService ?? new PersonalRecordService({ repository: recordRepository });
  const exerciseHistoryRepository =
    deps?.exerciseHistoryRepository ?? new SqliteExerciseHistoryRepository({ db });
  const homeDashboardRepository =
    deps?.homeDashboardRepository ?? new SqliteHomeDashboardRepository({ db });
  const statisticsRepository =
    deps?.statisticsRepository ?? new SqliteStatisticsRepository({ db, settings });
  const calendarRepository = deps?.calendarRepository ?? new SqliteCalendarRepository({ db });
  const bodyMetricRepository =
    deps?.bodyMetricRepository ?? new SqliteBodyMetricRepository({ db, clock, idGenerator });
  const bodyMetricService =
    deps?.bodyMetricService ?? new BodyMetricService({ repository: bodyMetricRepository });
  const progressPhotoRepository =
    deps?.progressPhotoRepository ??
    new SqliteProgressPhotoRepository({ db, clock, idGenerator, files });
  const progressPhotoService =
    deps?.progressPhotoService ??
    new ProgressPhotoService({
      repository: progressPhotoRepository,
      files,
      imageProcessor,
      idGenerator,
      logging,
    });
  const dataTransferRepository =
    deps?.dataTransferRepository ?? new SqliteDataTransferRepository({ db, clock, idGenerator });
  const dataTransferService =
    deps?.dataTransferService ??
    new DataTransferService({
      repository: dataTransferRepository,
      recordService,
      progressPhotoService,
      settings,
      // A dedicated cache-scoped `FileStorage`, mirroring `logging`'s own
      // `createFileStorage('cache')` call above rather than adding a new
      // `AppContainer` member for it - export/backup files are transient,
      // handed to the share sheet, not meant to accumulate in the document
      // directory across repeated exports. (Distinct from the container's
      // own `files` member, which is `'document'`-scoped for avatars/photos -
      // overriding this service's file storage for a test is done by passing
      // `deps.dataTransferService` wholesale, the same override shape every
      // other service in this function already uses.)
      files: createFileStorage('cache'),
      db,
      clock,
      idGenerator,
    });
  const workoutReminderServiceInstance = deps?.workoutReminderService ?? workoutReminderService;
  const notificationsInstance = deps?.notifications ?? notificationScheduler;
  const dailyGoalRepository =
    deps?.dailyGoalRepository ?? new SqliteDailyGoalRepository({ db, clock, idGenerator });
  const dailyGoalService =
    deps?.dailyGoalService ?? new DailyGoalService({ repository: dailyGoalRepository });
  const dailyReminderRepository =
    deps?.dailyReminderRepository ?? new SqliteDailyReminderRepository({ db, clock, idGenerator });
  const dailyReminderService =
    deps?.dailyReminderService ?? new DailyReminderService({ repository: dailyReminderRepository });
  const sessionRepository =
    deps?.sessionRepository ??
    new SqliteWorkoutSessionRepository({
      db,
      clock,
      idGenerator,
      personalRecordRepository: recordRepository,
    });
  const sessionService =
    deps?.sessionService ??
    new WorkoutSessionService({ repository: sessionRepository, settings, clock });

  return {
    db,
    clock,
    idGenerator,
    files,
    imageProcessor,
    logging,
    settings,
    profileRepository,
    profileService,
    exerciseRepository,
    exerciseService,
    planRepository,
    planService,
    recordRepository,
    recordService,
    exerciseHistoryRepository,
    homeDashboardRepository,
    statisticsRepository,
    calendarRepository,
    bodyMetricRepository,
    bodyMetricService,
    progressPhotoRepository,
    progressPhotoService,
    dataTransferRepository,
    dataTransferService,
    sessionRepository,
    sessionService,
    workoutReminderService: workoutReminderServiceInstance,
    dailyGoalRepository,
    dailyGoalService,
    dailyReminderRepository,
    dailyReminderService,
    notifications: notificationsInstance,
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
