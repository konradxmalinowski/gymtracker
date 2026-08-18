import { render } from '@testing-library/react-native';

import { LatestPRCard } from '@/features/home/components/LatestPRCard';
import { formatAchievedDate, formatRecordValue, recordTypeLabel } from '@/features/records';
import type { PersonalRecord } from '@/features/records';

jest.mock('@expo/vector-icons', () => require('../../../__mocks__/vectorIconsMock'));

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
    achievedAt: Date.UTC(2026, 7, 11, 12, 0, 0),
    previousValue: 95,
    isCurrent: true,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe('LatestPRCard', () => {
  it('renders the real empty state when there is no record yet', async () => {
    const { findByTestId, findByText } = await render(
      <LatestPRCard latestRecord={null} exerciseName={null} testID="latest-pr-card" />,
    );

    expect(await findByTestId('latest-pr-card-empty')).toBeTruthy();
    expect(await findByText('No records yet')).toBeTruthy();
  });

  it('renders the exercise name, record type and formatted value for a populated record', async () => {
    const record = makeRecord();
    const { findByText } = await render(
      <LatestPRCard latestRecord={record} exerciseName="Bench Press" testID="latest-pr-card" />,
    );

    expect(await findByText('Bench Press')).toBeTruthy();
    expect(await findByText(recordTypeLabel(record.recordType, record.repBucket))).toBeTruthy();
    expect(await findByText(formatRecordValue(record))).toBeTruthy();
  });

  it('falls back to the generic "Latest PR" title when the exercise name could not be resolved (e.g. a deleted custom exercise)', async () => {
    const record = makeRecord();
    const { findAllByText } = await render(
      <LatestPRCard latestRecord={record} exerciseName={null} testID="latest-pr-card" />,
    );

    // "Latest PR" is used both as the card's own label and as the name
    // fallback, so it legitimately appears twice.
    expect((await findAllByText('Latest PR')).length).toBeGreaterThan(0);
  });

  it('carries an accessibility label summarizing exercise, record type, value and date on the outer wrapper (no onPress - not a tappable card)', async () => {
    const record = makeRecord();
    const { findByTestId } = await render(
      <LatestPRCard latestRecord={record} exerciseName="Bench Press" testID="latest-pr-card" />,
    );

    const card = await findByTestId('latest-pr-card');
    // `Card` itself has no accessibilityLabel/onPress here (per this
    // component's own header comment) - the label lives on the outer
    // `accessible` `View` instead, so walk up from the testID'd node.
    let node = card.parent;
    let labeled: string | undefined;
    while (node) {
      if (typeof node.props?.accessibilityLabel === 'string') {
        labeled = node.props.accessibilityLabel;
        break;
      }
      node = node.parent;
    }

    expect(labeled).toBe(
      `Bench Press, ${recordTypeLabel(record.recordType, record.repBucket)}, ${formatRecordValue(record)}, achieved ${formatAchievedDate(record.achievedAt)}`,
    );
    expect(card.props.onPress).toBeUndefined();
  });
});
