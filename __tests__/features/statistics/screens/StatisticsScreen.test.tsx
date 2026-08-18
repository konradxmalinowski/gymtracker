import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AccessibilityInfo } from 'react-native';
import type { ReactNode } from 'react';

import type { StatisticsRepository } from '@/features/statistics/repository/StatisticsRepository';
import { StatisticsScreen } from '@/features/statistics/screens/StatisticsScreen';
import { FixedClock } from '@/services/clock';
import { useContainer } from '@/services/container';

jest.mock('@expo/vector-icons', () => require('../../../__mocks__/vectorIconsMock'));

jest.mock('@/services/container', () => ({ useContainer: jest.fn() }));

const TODAY = '2026-08-18';

function buildFakeStatisticsRepository(): jest.Mocked<StatisticsRepository> {
  return {
    volumeByPeriod: jest.fn().mockResolvedValue([{ bucketStart: '2026-08-01', value: 500 }]),
    sessionFrequency: jest.fn().mockResolvedValue([{ bucketStart: '2026-08-01', value: 2 }]),
    durationTrend: jest.fn().mockResolvedValue([{ bucketStart: '2026-08-01', value: 1800 }]),
    muscleGroupVolume: jest.fn().mockResolvedValue([{ bodyPart: 'upper', volumeKg: 500 }]),
    exerciseProgression: jest.fn().mockResolvedValue([]),
    yearlyHeatmap: jest.fn().mockResolvedValue([{ localDate: TODAY, volumeKg: 500, level: 2 }]),
  };
}

let activeQueryClient: QueryClient | undefined;

afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient?.unmount();
  activeQueryClient = undefined;
  jest.clearAllMocks();
});

async function renderScreen(statisticsRepository: StatisticsRepository) {
  (useContainer as jest.Mock).mockReturnValue({
    statisticsRepository,
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

  return render(<StatisticsScreen />, { wrapper: Wrapper });
}

describe('StatisticsScreen', () => {
  it('announces loading, then transitions from the skeleton to the populated dashboard', async () => {
    const statisticsRepository = buildFakeStatisticsRepository();
    const announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');

    const { findByTestId } = await renderScreen(statisticsRepository);

    expect(announceSpy).toHaveBeenCalledWith('Loading');

    expect(await findByTestId('statistics-volume-card')).toBeTruthy();
    expect(await findByTestId('statistics-frequency-card')).toBeTruthy();
    expect(await findByTestId('statistics-duration-card')).toBeTruthy();
    expect(await findByTestId('statistics-muscle-volume-card')).toBeTruthy();
    expect(await findByTestId('statistics-heatmap-card')).toBeTruthy();
  });

  it('shows an error state with retry when the dashboard query fails, and refetches on retry', async () => {
    const statisticsRepository = buildFakeStatisticsRepository();
    statisticsRepository.volumeByPeriod.mockRejectedValueOnce(new Error('boom'));

    const { findByText } = await renderScreen(statisticsRepository);

    expect(await findByText('Could not load your statistics.')).toBeTruthy();

    await fireEvent.press(await findByText('Try again'));

    await waitFor(() => expect(statisticsRepository.volumeByPeriod).toHaveBeenCalledTimes(2));
  });

  it('requests a different date range when the range selector is changed', async () => {
    const statisticsRepository = buildFakeStatisticsRepository();

    const { findByTestId, getByRole } = await renderScreen(statisticsRepository);
    await findByTestId('statistics-volume-card');

    const [initialFrom] = statisticsRepository.volumeByPeriod.mock.calls[0]!;

    await fireEvent.press(getByRole('tab', { name: '1 year' }));

    await waitFor(() => expect(statisticsRepository.volumeByPeriod).toHaveBeenCalledTimes(2));
    const [rangedFrom] = statisticsRepository.volumeByPeriod.mock.calls[1]!;
    expect(rangedFrom).not.toBe(initialFrom);
  });
});
