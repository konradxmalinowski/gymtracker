import { act, fireEvent, render } from '@testing-library/react-native';

import type { SessionExercise } from '@/features/workout-logging';
import { ExerciseHeader } from '@/features/workout-logging/components/ExerciseHeader';

jest.mock('@expo/vector-icons', () => require('../../../__mocks__/vectorIconsMock'));

const DEBOUNCE_MS = 400;

function makeExercise(overrides: Partial<SessionExercise> = {}): SessionExercise {
  return {
    id: 'se-1',
    sessionId: 'session-1',
    exerciseId: 'ex-1',
    exerciseNameSnapshot: 'Bench Press',
    sortOrder: 0,
    supersetGroup: null,
    restSecondsOverride: null,
    note: null,
    createdAt: 1000,
    updatedAt: 1000,
    exercise: {
      id: 'ex-1',
      source: 'catalog',
      catalogSlug: 'bench-press',
      nameEn: 'Bench Press',
      namePl: null,
      displayNameOverride: null,
      level: null,
      equipmentSlug: null,
      bodyPart: null,
      trackingType: 'weight_reps',
      primaryImage: null,
      isFavorite: false,
    },
    sets: [],
    ...overrides,
  };
}

async function renderHeader(overrides: Partial<Parameters<typeof ExerciseHeader>[0]> = {}) {
  const exercise = overrides.exercise ?? makeExercise();
  const handlers = {
    onMoveUp: jest.fn(),
    onMoveDown: jest.fn(),
    onRemove: jest.fn(),
    onUpdateNote: jest.fn(),
  };

  const view = await render(
    <ExerciseHeader
      exercise={exercise}
      canMoveUp
      canMoveDown
      onMoveUp={handlers.onMoveUp}
      onMoveDown={handlers.onMoveDown}
      onRemove={handlers.onRemove}
      onUpdateNote={handlers.onUpdateNote}
      testID="exercise-header"
      {...overrides}
    />,
  );

  return { ...view, ...handlers };
}

describe('ExerciseHeader note editing', () => {
  it('the note toggle is closed by default - no note field is rendered', async () => {
    const { queryByTestId } = await renderHeader();
    expect(queryByTestId('exercise-header-note-field')).toBeNull();
  });

  it('tapping the note toggle reveals an inline field pre-filled with the current note', async () => {
    const { findByTestId, findByDisplayValue } = await renderHeader({
      exercise: makeExercise({ note: 'Elbows tucked' }),
    });

    fireEvent.press(await findByTestId('exercise-header-note-toggle'));

    expect(await findByDisplayValue('Elbows tucked')).toBeTruthy();
  });

  it('renders the filled note icon only when a note is present, outline otherwise', async () => {
    // The mocked Ionicons renders its `name` prop as plain text (see
    // `__mocks__/vectorIconsMock.tsx`), so the filled/outline distinction is
    // directly observable as which icon name text is on screen.
    const withNote = await renderHeader({ exercise: makeExercise({ note: 'has a note' }) });
    expect(await withNote.findByText('chatbubble')).toBeTruthy();

    const withoutNote = await renderHeader({ exercise: makeExercise({ note: null }) });
    expect(await withoutNote.findByText('chatbubble-outline')).toBeTruthy();
  });

  describe('debounced commit', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    // Both assertions share a single `render()` call - a second `render()`
    // under active fake timers in this RNTL version reliably fails to find
    // elements in the newly rendered tree (the same class of environment
    // quirk `useReorderPlans.test.tsx` documents for repeated `renderHook()`
    // calls), so this stays one test with two sequential edits rather than
    // two independent tests each with their own render.
    it('debounces a commit to the trimmed value, and clearing the field down to blank commits null', async () => {
      const { findByTestId, onUpdateNote } = await renderHeader({
        exercise: makeExercise({ note: 'temporary' }),
      });

      fireEvent.press(await findByTestId('exercise-header-note-toggle'));
      const field = await findByTestId('exercise-header-note-field');

      fireEvent.changeText(field, 'Go slow on the eccentric');
      expect(onUpdateNote).not.toHaveBeenCalled();
      await act(async () => {
        jest.advanceTimersByTime(DEBOUNCE_MS);
      });
      expect(onUpdateNote).toHaveBeenLastCalledWith('Go slow on the eccentric');

      fireEvent.changeText(field, '   ');
      await act(async () => {
        jest.advanceTimersByTime(DEBOUNCE_MS);
      });
      expect(onUpdateNote).toHaveBeenLastCalledWith(null);
    });
  });
});
