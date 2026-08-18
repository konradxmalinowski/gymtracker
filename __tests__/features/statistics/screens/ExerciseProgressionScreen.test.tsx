import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';

import type { Exercise } from '@/features/exercise-library';
import { ExerciseProgressionScreen } from '@/features/statistics/screens/ExerciseProgressionScreen';
import type { StatisticsRepository } from '@/features/statistics/repository/StatisticsRepository';
import { FixedClock } from '@/services/clock';
import { useContainer } from '@/services/container';

jest.mock('@expo/vector-icons', () => require('../../../__mocks__/vectorIconsMock'));

jest.mock('@/services/container', () => ({ useContainer: jest.fn() }));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(),
  Stack: { Screen: jest.fn(() => null) },
}));

const EXERCISE_ID = 'exercise-1';

function buildFakeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: EXERCISE_ID,
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
    equipmentSlug: 'barbell',
    bodyPart: 'upper',
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

function buildFakeStatisticsRepository(): jest.Mocked<StatisticsRepository> {
  return {
    volumeByPeriod: jest.fn().mockResolvedValue([]),
    sessionFrequency: jest.fn().mockResolvedValue([]),
    durationTrend: jest.fn().mockResolvedValue([]),
    muscleGroupVolume: jest.fn().mockResolvedValue([]),
    exerciseProgression: jest.fn().mockResolvedValue([{ bucketStart: '2026-08-01', value: 100 }]),
    yearlyHeatmap: jest.fn().mockResolvedValue([]),
  };
}

let activeQueryClient: QueryClient | undefined;

afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient?.unmount();
  activeQueryClient = undefined;
  jest.clearAllMocks();
});

async function renderScreen(statisticsRepository: StatisticsRepository, exercise: Exercise | null) {
  (useLocalSearchParams as jest.Mock).mockReturnValue({ exerciseId: EXERCISE_ID });
  (useContainer as jest.Mock).mockReturnValue({
    statisticsRepository,
    exerciseService: { getById: jest.fn().mockResolvedValue(exercise) },
    clock: new FixedClock(Date.UTC(2026, 7, 18, 12, 0, 0)),
  });

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  activeQueryClient = queryClient;

  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return render(<ExerciseProgressionScreen />, { wrapper: Wrapper });
}

describe('ExerciseProgressionScreen', () => {
  it('renders a loading skeleton before the exercise/progression data resolves', async () => {
    const statisticsRepository = buildFakeStatisticsRepository();

    const { findByTestId } = await renderScreen(statisticsRepository, buildFakeExercise());

    expect(await findByTestId('exercise-progression-screen')).toBeTruthy();
  });

  it('shows an error state with retry when the progression query fails', async () => {
    const statisticsRepository = buildFakeStatisticsRepository();
    statisticsRepository.exerciseProgression.mockRejectedValueOnce(new Error('boom'));

    const { findByText } = await renderScreen(statisticsRepository, buildFakeExercise());

    expect(await findByText('Could not load this exercise’s progression.')).toBeTruthy();
  });

  it('sets the exercise name as the Stack.Screen title once the exercise resolves', async () => {
    const statisticsRepository = buildFakeStatisticsRepository();

    const { findByTestId } = await renderScreen(
      statisticsRepository,
      buildFakeExercise({ nameEn: 'Barbell Squat' }),
    );

    await findByTestId('exercise-progression-card');

    const lastCall = (Stack.Screen as unknown as jest.Mock).mock.calls.at(-1)!;
    expect(lastCall[0].options.title).toBe('Barbell Squat');
  });

  it('queries progression scoped to the route exerciseId', async () => {
    const statisticsRepository = buildFakeStatisticsRepository();

    const { findByTestId } = await renderScreen(statisticsRepository, buildFakeExercise());
    await findByTestId('exercise-progression-card');

    expect(statisticsRepository.exerciseProgression).toHaveBeenCalledWith(
      EXERCISE_ID,
      expect.any(String),
      expect.any(String),
      expect.any(String),
      'top_set',
    );
  });

  it('switches metrics and requests the new metric from the repository', async () => {
    const statisticsRepository = buildFakeStatisticsRepository();

    const { findByTestId, getByRole } = await renderScreen(
      statisticsRepository,
      buildFakeExercise(),
    );
    await findByTestId('exercise-progression-card');
    expect(statisticsRepository.exerciseProgression).toHaveBeenCalledTimes(1);

    await fireEvent.press(getByRole('tab', { name: 'Est. 1RM' }));

    await waitFor(() => expect(statisticsRepository.exerciseProgression).toHaveBeenCalledTimes(2));
    expect(statisticsRepository.exerciseProgression).toHaveBeenLastCalledWith(
      EXERCISE_ID,
      expect.any(String),
      expect.any(String),
      expect.any(String),
      'e1rm',
    );
  });
});
