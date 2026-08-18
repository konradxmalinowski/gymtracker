import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type { Exercise, ExerciseService } from '@/features/exercise-library';
import { useHomeDashboard } from '@/features/home/hooks/useHomeDashboard';
import type {
  HomeDashboardRepository,
  HomeLastSessionDto,
  HomeWeeklySummary,
} from '@/features/home/repository/HomeDashboardRepository';
import type { PlanAggregate, PlanDay, PlanListItem, PlanService } from '@/features/plans';
import type { PersonalRecord, PersonalRecordService } from '@/features/records';
import { FixedClock } from '@/services/clock';

/**
 * `PlanService`/`PersonalRecordService`/`ExerciseService` are classes with a
 * private `deps` field, so they are nominally (not structurally) typed - a
 * plain object literal implementing only the handful of methods
 * `useHomeDashboard` actually calls cannot satisfy the class type without a
 * cast. This mirrors `useHomeDashboard`'s own doc comment ("every dependency
 * taken as a parameter... its own tests never need to stand up a full
 * `useContainer()` provider tree") - the whole point of DI here is to mock at
 * exactly this seam, not to construct real service instances over a fake
 * repository.
 */
function makePlanService(overrides: { listPlans?: jest.Mock; getPlan?: jest.Mock }): PlanService {
  return {
    listPlans: overrides.listPlans ?? jest.fn().mockResolvedValue([]),
    getPlan: overrides.getPlan ?? jest.fn().mockResolvedValue(null),
  } as unknown as PlanService;
}

function makeRecordService(listRecent: jest.Mock): PersonalRecordService {
  return { listRecent } as unknown as PersonalRecordService;
}

function makeExerciseService(getById: jest.Mock): ExerciseService {
  return { getById } as unknown as ExerciseService;
}

function makeHomeDashboardRepository(overrides: {
  getTrainingLocalDates?: jest.Mock;
  getWeeklySummary?: jest.Mock;
  getLastCompletedSession?: jest.Mock;
  getMostRecentCompletedPlanDayId?: jest.Mock;
}): HomeDashboardRepository {
  return {
    getTrainingLocalDates: overrides.getTrainingLocalDates ?? jest.fn().mockResolvedValue([]),
    getWeeklySummary:
      overrides.getWeeklySummary ??
      jest.fn().mockResolvedValue({ workouts: 0, sets: 0, volumeKg: 0, durationSeconds: 0 }),
    getLastCompletedSession: overrides.getLastCompletedSession ?? jest.fn().mockResolvedValue(null),
    getMostRecentCompletedPlanDayId:
      overrides.getMostRecentCompletedPlanDayId ?? jest.fn().mockResolvedValue(null),
  };
}

function makePlanListItem(overrides: Partial<PlanListItem> = {}): PlanListItem {
  return {
    id: 'plan-1',
    name: 'Push Pull Legs',
    description: null,
    color: null,
    isActive: true,
    sortOrder: 0,
    dayCount: 2,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makePlanDay(overrides: Partial<PlanDay> = {}): PlanDay {
  return {
    id: 'day-a',
    planId: 'plan-1',
    name: 'Day A',
    note: null,
    sortOrder: 0,
    createdAt: 0,
    updatedAt: 0,
    exercises: [],
    ...overrides,
  };
}

function makePlanAggregate(overrides: Partial<PlanAggregate> = {}): PlanAggregate {
  return {
    id: 'plan-1',
    name: 'Push Pull Legs',
    description: null,
    color: null,
    isActive: true,
    sortOrder: 0,
    createdAt: 0,
    updatedAt: 0,
    days: [],
    ...overrides,
  };
}

function makeRecord(overrides: Partial<PersonalRecord> = {}): PersonalRecord {
  return {
    id: 'pr-1',
    exerciseId: 'ex-1',
    recordType: 'max_weight',
    repBucket: null,
    value: 100,
    weightKg: 100,
    reps: 5,
    workoutSetId: 'set-1',
    sessionId: 'session-1',
    achievedAt: 1000,
    previousValue: null,
    isCurrent: true,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'ex-1',
    source: 'catalog',
    catalogSlug: 'bench-press',
    nameEn: 'Bench Press',
    namePl: null,
    nameSearch: 'bench press',
    aliases: [],
    category: null,
    force: null,
    mechanic: null,
    level: null,
    equipmentSlug: null,
    bodyPart: null,
    trackingType: 'weight_reps',
    instructions: [],
    images: [],
    createdAt: 0,
    updatedAt: 0,
    muscles: [],
    videos: [],
    userData: {
      isFavorite: false,
      favoritedAt: null,
      note: null,
      defaultRestSeconds: null,
      displayNameOverride: null,
      lastPerformedAt: null,
    },
    ...overrides,
  };
}

const LAST_SESSION: HomeLastSessionDto = {
  id: 'session-1',
  title: 'Push Day',
  localDate: '2026-08-18',
  totalVolumeKg: 480,
  totalSets: 12,
  durationSeconds: 3600,
  finishedAt: 1_000_000,
};

const WEEKLY_SUMMARY: HomeWeeklySummary = {
  workouts: 3,
  sets: 24,
  volumeKg: 1200,
  durationSeconds: 7200,
};

// Wednesday, noon UTC - far enough from midnight that no reasonable CI
// timezone rolls it over to a different calendar day.
const NOW = Date.UTC(2026, 7, 19, 12, 0, 0);
const TODAY_LOCAL_DATE = '2026-08-19';
const WEEK_START_LOCAL_DATE = '2026-08-17'; // Monday on/before TODAY_LOCAL_DATE
const STREAK_SINCE_LOCAL_DATE = '2025-07-15'; // TODAY_LOCAL_DATE minus 400 days

let activeQueryClient: QueryClient | undefined;

afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient?.unmount();
  activeQueryClient = undefined;
});

async function renderDashboard(deps: {
  homeDashboardRepository: HomeDashboardRepository;
  planService: PlanService;
  recordService: PersonalRecordService;
  exerciseService: ExerciseService;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  activeQueryClient = queryClient;

  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return renderHook(
    () =>
      useHomeDashboard({
        ...deps,
        clock: new FixedClock(NOW),
      }),
    { wrapper: Wrapper },
  );
}

describe('useHomeDashboard', () => {
  it('composes lastSession/streak/weeklySummary/latestRecord from the independent reads when there is no active plan', async () => {
    const getTrainingLocalDates = jest
      .fn()
      .mockResolvedValue(['2026-08-19', '2026-08-18', '2026-08-17']);
    const getWeeklySummary = jest.fn().mockResolvedValue(WEEKLY_SUMMARY);
    const getLastCompletedSession = jest.fn().mockResolvedValue(LAST_SESSION);
    const getMostRecentCompletedPlanDayId = jest.fn();
    const listPlans = jest.fn().mockResolvedValue([]);
    const getPlan = jest.fn();
    const listRecent = jest.fn().mockResolvedValue([]);
    const getById = jest.fn();

    const { result } = await renderDashboard({
      homeDashboardRepository: makeHomeDashboardRepository({
        getTrainingLocalDates,
        getWeeklySummary,
        getLastCompletedSession,
        getMostRecentCompletedPlanDayId,
      }),
      planService: makePlanService({ listPlans, getPlan }),
      recordService: makeRecordService(listRecent),
      exerciseService: makeExerciseService(getById),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      activePlan: null,
      suggestedDay: null,
      lastSession: LAST_SESSION,
      streak: 3,
      weeklySummary: WEEKLY_SUMMARY,
      latestRecord: null,
      latestRecordExerciseName: null,
    });

    // No active plan -> the plan-dependent reads never run.
    expect(getPlan).not.toHaveBeenCalled();
    expect(getMostRecentCompletedPlanDayId).not.toHaveBeenCalled();
    expect(getById).not.toHaveBeenCalled();

    expect(getTrainingLocalDates).toHaveBeenCalledWith(STREAK_SINCE_LOCAL_DATE);
    expect(getWeeklySummary).toHaveBeenCalledWith(WEEK_START_LOCAL_DATE, TODAY_LOCAL_DATE);
  });

  it('resolves suggestedDay to the first day (by sortOrder) when the active plan has zero prior completed sessions', async () => {
    const days = [
      makePlanDay({ id: 'day-b', sortOrder: 1 }),
      makePlanDay({ id: 'day-a', sortOrder: 0 }),
    ];
    const activePlan = makePlanAggregate({ days });
    const listPlans = jest.fn().mockResolvedValue([makePlanListItem()]);
    const getPlan = jest.fn().mockResolvedValue(activePlan);
    const getMostRecentCompletedPlanDayId = jest.fn().mockResolvedValue(null);

    const { result } = await renderDashboard({
      homeDashboardRepository: makeHomeDashboardRepository({ getMostRecentCompletedPlanDayId }),
      planService: makePlanService({ listPlans, getPlan }),
      recordService: makeRecordService(jest.fn().mockResolvedValue([])),
      exerciseService: makeExerciseService(jest.fn()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getPlan).toHaveBeenCalledWith('plan-1');
    expect(getMostRecentCompletedPlanDayId).toHaveBeenCalledWith('plan-1');
    expect(result.current.data?.activePlan).toEqual(activePlan);
    expect(result.current.data?.suggestedDay).toEqual(days[1]); // day-a, sortOrder 0
  });

  it('resolves suggestedDay to the day after the most recently completed one when a prior session exists', async () => {
    const days = [
      makePlanDay({ id: 'day-a', sortOrder: 0 }),
      makePlanDay({ id: 'day-b', sortOrder: 1 }),
    ];
    const activePlan = makePlanAggregate({ days });
    const listPlans = jest.fn().mockResolvedValue([makePlanListItem()]);
    const getPlan = jest.fn().mockResolvedValue(activePlan);
    const getMostRecentCompletedPlanDayId = jest.fn().mockResolvedValue('day-a');

    const { result } = await renderDashboard({
      homeDashboardRepository: makeHomeDashboardRepository({ getMostRecentCompletedPlanDayId }),
      planService: makePlanService({ listPlans, getPlan }),
      recordService: makeRecordService(jest.fn().mockResolvedValue([])),
      exerciseService: makeExerciseService(jest.fn()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.suggestedDay).toEqual(days[1]); // day-b
  });

  it('resolves the latest record exercise name via exerciseService.getById, using formatExerciseName', async () => {
    const record = makeRecord({ exerciseId: 'ex-1' });
    const listRecent = jest.fn().mockResolvedValue([record]);
    const getById = jest.fn().mockResolvedValue(makeExercise({ nameEn: 'Bench Press' }));

    const { result } = await renderDashboard({
      homeDashboardRepository: makeHomeDashboardRepository({}),
      planService: makePlanService({}),
      recordService: makeRecordService(listRecent),
      exerciseService: makeExerciseService(getById),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(listRecent).toHaveBeenCalledWith(1);
    expect(getById).toHaveBeenCalledWith('ex-1');
    expect(result.current.data?.latestRecord).toEqual(record);
    expect(result.current.data?.latestRecordExerciseName).toBe('Bench Press');
  });

  it('leaves latestRecordExerciseName null, without calling exerciseService.getById, when there is no recent record', async () => {
    const getById = jest.fn();

    const { result } = await renderDashboard({
      homeDashboardRepository: makeHomeDashboardRepository({}),
      planService: makePlanService({}),
      recordService: makeRecordService(jest.fn().mockResolvedValue([])),
      exerciseService: makeExerciseService(getById),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.latestRecord).toBeNull();
    expect(result.current.data?.latestRecordExerciseName).toBeNull();
    expect(getById).not.toHaveBeenCalled();
  });

  it('leaves latestRecordExerciseName null when the exercise lookup itself comes back empty (e.g. a deleted custom exercise)', async () => {
    const record = makeRecord({ exerciseId: 'deleted-ex' });
    const listRecent = jest.fn().mockResolvedValue([record]);
    const getById = jest.fn().mockResolvedValue(null);

    const { result } = await renderDashboard({
      homeDashboardRepository: makeHomeDashboardRepository({}),
      planService: makePlanService({}),
      recordService: makeRecordService(listRecent),
      exerciseService: makeExerciseService(getById),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.latestRecord).toEqual(record);
    expect(result.current.data?.latestRecordExerciseName).toBeNull();
  });
});
