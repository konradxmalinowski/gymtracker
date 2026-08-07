import { fireEvent, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createTestDatabase } from '@/database/node/createTestDatabase';
import { WorkoutHeader } from '@/features/workout-logging/components/WorkoutHeader';
import { ContainerProvider, createContainer } from '@/services/container';

jest.mock('@expo/vector-icons', () => require('../../../__mocks__/vectorIconsMock'));

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

function Wrapper({ children }: { children: ReactNode }) {
  const container = createContainer(createTestDatabase());
  return (
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <ContainerProvider container={container}>{children}</ContainerProvider>
    </SafeAreaProvider>
  );
}

async function renderHeader(overrides: Partial<Parameters<typeof WorkoutHeader>[0]> = {}) {
  const handlers = {
    onMinimize: jest.fn(),
    onFinish: jest.fn(),
    onDiscard: jest.fn(),
    onUpdateNotes: jest.fn(),
  };

  const view = await render(
    <WorkoutHeader
      title="Push Day A"
      startedAt={1000}
      pausedMs={0}
      notes={null}
      onMinimize={handlers.onMinimize}
      onFinish={handlers.onFinish}
      onDiscard={handlers.onDiscard}
      onUpdateNotes={handlers.onUpdateNotes}
      isFinishing={false}
      testID="workout-header"
      {...overrides}
    />,
    { wrapper: Wrapper },
  );

  return { ...view, ...handlers };
}

describe('WorkoutHeader notes sheet', () => {
  it('the notes sheet is closed until the notes icon is tapped', async () => {
    const { queryByTestId, findByTestId } = await renderHeader();
    expect(queryByTestId('workout-header-notes-field')).toBeNull();

    fireEvent.press(await findByTestId('workout-header-notes'));
    expect(await findByTestId('workout-header-notes-field')).toBeTruthy();
  });

  it('pre-fills the field from the current notes and Save commits the edited value', async () => {
    const { findByTestId, findByDisplayValue, onUpdateNotes } = await renderHeader({
      notes: 'Started a new mesocycle',
    });

    fireEvent.press(await findByTestId('workout-header-notes'));
    const field = await findByDisplayValue('Started a new mesocycle');
    fireEvent.changeText(field, 'Started a new mesocycle - week 1');

    fireEvent.press(await findByTestId('workout-header-notes-save'));

    expect(onUpdateNotes).toHaveBeenCalledWith('Started a new mesocycle - week 1');
  });

  it('saving a blank field commits null, not an empty string', async () => {
    const { findByTestId, onUpdateNotes } = await renderHeader({ notes: 'temporary' });

    fireEvent.press(await findByTestId('workout-header-notes'));
    const field = await findByTestId('workout-header-notes-field');
    fireEvent.changeText(field, '   ');
    fireEvent.press(await findByTestId('workout-header-notes-save'));

    expect(onUpdateNotes).toHaveBeenCalledWith(null);
  });

  it('renders the filled notes icon only when notes are already present', async () => {
    const withNotes = await renderHeader({ notes: 'has notes' });
    expect(await withNotes.findByText('document-text')).toBeTruthy();

    const withoutNotes = await renderHeader({ notes: null });
    expect(await withoutNotes.findByText('document-text-outline')).toBeTruthy();
  });
});
