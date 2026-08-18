import { SegmentedControl } from '@/components/ui';
import { t } from '@/i18n';

import { STAT_RANGES, type StatRange } from '../domain/statRange';

export interface StatRangeSelectorProps {
  value: StatRange;
  onChange: (range: StatRange) => void;
  testID?: string | undefined;
}

const RANGE_LABEL_KEY: Record<
  StatRange,
  | 'statistics.range.fourWeeks'
  | 'statistics.range.threeMonths'
  | 'statistics.range.oneYear'
  | 'statistics.range.allTime'
> = {
  '4w': 'statistics.range.fourWeeks',
  '3m': 'statistics.range.threeMonths',
  '1y': 'statistics.range.oneYear',
  all: 'statistics.range.allTime',
};

/** The single, screen-level range control every chart on the Statistics dashboard shares (ADR-0010/section 10's `StatRangeSelector`). */
export function StatRangeSelector({ value, onChange, testID }: StatRangeSelectorProps) {
  return (
    <SegmentedControl
      options={STAT_RANGES.map((range) => ({ value: range, label: t(RANGE_LABEL_KEY[range]) }))}
      value={value}
      onChange={onChange}
      testID={testID}
    />
  );
}
