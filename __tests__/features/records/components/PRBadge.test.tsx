import { render, waitFor } from '@testing-library/react-native';

import { PRBadge } from '@/features/records/components/PRBadge';
import type { PersonalRecord } from '@/features/records/repository/PersonalRecordRepository';

jest.mock('@expo/vector-icons', () => require('../../../__mocks__/vectorIconsMock'));

const mockPersonalRecord = jest.fn();
jest.mock('@/services/haptics', () => ({
  haptics: {
    personalRecord: (...args: unknown[]) => mockPersonalRecord(...args),
  },
}));

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

afterEach(() => {
  mockPersonalRecord.mockClear();
});

describe('PRBadge', () => {
  it('renders nothing - a clean absence, not a hidden placeholder - when records is empty', async () => {
    const { toJSON } = await render(<PRBadge records={[]} testID="pr-badge" />);
    expect(toJSON()).toBeNull();
  });

  it('renders a labeled badge, readable as a single accessibility unit, when records is non-empty', async () => {
    const { findByTestId, findByText } = await render(
      <PRBadge records={[makeRecord()]} testID="pr-badge" />,
    );

    const badge = await findByTestId('pr-badge');
    expect(badge.props.accessibilityRole).toBe('text');
    expect(await findByText('New PR!')).toBeTruthy();
  });

  it('pluralizes the label for more than one record', async () => {
    const { findByText } = await render(
      <PRBadge
        records={[makeRecord({ id: 'pr-1' }), makeRecord({ id: 'pr-2', recordType: 'max_reps' })]}
        testID="pr-badge"
      />,
    );

    expect(await findByText('2 new PRs!')).toBeTruthy();
  });

  /**
   * `waitFor(() => expect(...).toHaveBeenCalledTimes(n))` immediately after
   * the "must not re-fire" rerender cannot actually prove that on its own -
   * `waitFor` resolves as soon as its assertion stops throwing, so a spurious
   * effect that fires on a later tick than `waitFor`'s first synchronous
   * check would slip through as a false pass. Confirmed empirically while
   * re-verifying this suite (P8 test-coverage pass): a deliberately broken
   * `PRBadge` (comparing `records` by array reference instead of the
   * documented id-derived key) still made
   * `waitFor(() => expect(...).toHaveBeenCalledTimes(1))`, called right after
   * such a rerender, pass - the spurious re-fire only became observable after
   * a real macrotask delay. A genuine, unwrapped `await` on a real timer
   * (not `act()` - wrapping this specific await in `act()` was tried and
   * found to leave a dangling internal React scheduler task that corrupts
   * whichever test runs next in this file) gives the effect queue a real
   * chance to run before the assertion below checks it.
   */
  it('fires haptics.personalRecord() exactly once for a given non-empty records value, not on a re-render carrying the same record ids - whether the array is the same reference or a freshly-built one', async () => {
    const records = [makeRecord({ id: 'pr-1' })];
    const { rerender, findByTestId } = await render(
      <PRBadge records={records} testID="pr-badge" />,
    );
    await findByTestId('pr-badge');
    expect(mockPersonalRecord).toHaveBeenCalledTimes(1);

    // Same records array (same reference, same ids) re-rendered - must not
    // re-fire.
    rerender(<PRBadge records={records} testID="pr-badge" />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockPersonalRecord).toHaveBeenCalledTimes(1);

    // A brand-new array instance, never seen before, but built from the same
    // ids - e.g. a Zustand selector or React Query re-deriving the same
    // logical PRs into a new array on an unrelated state update. Must not
    // re-fire either: the dedup key is the records' own ids, not array
    // identity.
    rerender(<PRBadge records={[makeRecord({ id: 'pr-1' })]} testID="pr-badge" />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockPersonalRecord).toHaveBeenCalledTimes(1);

    // A genuinely different set of records (different id) fires again.
    rerender(<PRBadge records={[makeRecord({ id: 'pr-2' })]} testID="pr-badge" />);
    await waitFor(() => expect(mockPersonalRecord).toHaveBeenCalledTimes(2));
  });

  it('never fires haptics when records is empty', async () => {
    await render(<PRBadge records={[]} testID="pr-badge" />);
    expect(mockPersonalRecord).not.toHaveBeenCalled();
  });
});
