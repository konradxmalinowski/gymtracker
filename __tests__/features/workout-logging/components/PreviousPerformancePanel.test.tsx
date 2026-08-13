import { render } from '@testing-library/react-native';

import { PreviousPerformancePanel } from '@/features/workout-logging/components/PreviousPerformancePanel';
import type { PreviousPerformance } from '@/features/workout-logging/repository/ExerciseHistoryRepository';

function makePreviousPerformance(
  overrides: Partial<PreviousPerformance> = {},
): PreviousPerformance {
  return {
    sessionId: 'session-1',
    sessionExerciseId: 'se-1',
    localDate: '2026-08-10',
    performedAt: Date.UTC(2026, 7, 10, 12, 0, 0),
    sets: [
      {
        id: 'set-1',
        setType: 'normal',
        weightKg: 60,
        reps: 8,
        durationSeconds: null,
        distanceM: null,
        rpe: null,
        performedAt: Date.UTC(2026, 7, 10, 12, 0, 0),
      },
    ],
    ...overrides,
  };
}

describe('PreviousPerformancePanel', () => {
  it('shows a skeleton while pending', async () => {
    const { queryByText } = await render(
      <PreviousPerformancePanel
        previousPerformance={null}
        isPending
        testID="previous-performance"
      />,
    );

    expect(queryByText(/No previous session data yet/)).toBeNull();
  });

  it('shows the genuine empty message when there is no prior session', async () => {
    const { findByText } = await render(
      <PreviousPerformancePanel
        previousPerformance={null}
        isPending={false}
        testID="previous-performance"
      />,
    );

    expect(
      await findByText(
        'No previous session data yet - this will fill in once you log this exercise again.',
      ),
    ).toBeTruthy();
  });

  it('renders the last session date and each set once data resolves', async () => {
    const { findByText } = await render(
      <PreviousPerformancePanel
        previousPerformance={makePreviousPerformance()}
        isPending={false}
        testID="previous-performance"
      />,
    );

    expect(await findByText(/Last time - Aug 10/)).toBeTruthy();
    expect(await findByText('1. 60 kg x 8')).toBeTruthy();
  });
});
