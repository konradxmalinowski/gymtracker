import * as fc from 'fast-check';

import {
  assignSetDisplayNumbers,
  orderSetsForDisplay,
  type NumberableSet,
} from '@/features/workout-logging/domain/setDisplayNumbering';
import { isSessionStale } from '@/features/workout-logging/domain/sessionStaleness';

function parent(id: string, setIndex: number): NumberableSet {
  return { id, setIndex, parentSetId: null };
}

function drop(id: string, parentId: string, setIndex: number): NumberableSet {
  return { id, setIndex, parentSetId: parentId };
}

describe('assignSetDisplayNumbers - ADR-0006 drop-set display rules', () => {
  it('numbers parent sets sequentially from 1', () => {
    const numbers = assignSetDisplayNumbers([parent('a', 1), parent('b', 2), parent('c', 3)]);
    expect([...numbers.values()].map((n) => n.label)).toEqual(['1', '2', '3']);
  });

  it('gives a drop segment its parent number, not a number of its own', () => {
    const numbers = assignSetDisplayNumbers([
      parent('a', 1),
      parent('b', 2),
      drop('b1', 'b', 2),
      drop('b2', 'b', 2),
      parent('c', 3),
    ]);

    expect(numbers.get('b')!.label).toBe('2');
    expect(numbers.get('b1')).toEqual({
      displayNumber: 2,
      isDropSegment: true,
      dropOrdinal: 1,
      label: '2.1',
    });
    expect(numbers.get('b2')!.label).toBe('2.2');
    // The set after a drop chain is still 3 - drops never consume a number.
    expect(numbers.get('c')!.label).toBe('3');
  });

  it('renumbers from 1 rather than echoing set_index after a set is deleted', () => {
    // set_index 2 was deleted; the remaining rows are 1 and 3.
    const numbers = assignSetDisplayNumbers([parent('a', 1), parent('c', 3)]);
    expect(numbers.get('c')!.displayNumber).toBe(2);
  });

  it('numbers an orphaned drop segment rather than leaving it unlabelled', () => {
    const numbers = assignSetDisplayNumbers([parent('a', 1), drop('orphan', 'gone', 2)]);
    expect(numbers.get('orphan')).toEqual({
      displayNumber: 2,
      isDropSegment: true,
      dropOrdinal: null,
      label: '2',
    });
  });

  it('assigns exactly one number per set, for any generated list', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 8 }),
        fc.integer({ min: 0, max: 4 }),
        (parents, drops) => {
          const sets: NumberableSet[] = [];
          for (let i = 0; i < parents; i += 1) {
            sets.push(parent(`p${i}`, i + 1));
            for (let d = 0; d < drops; d += 1) {
              sets.push(drop(`p${i}-d${d}`, `p${i}`, i + 1));
            }
          }
          const numbers = assignSetDisplayNumbers(sets);
          expect(numbers.size).toBe(sets.length);
          const parentLabels = sets
            .filter((s) => s.parentSetId === null)
            .map((s) => numbers.get(s.id)!.displayNumber);
          expect(parentLabels).toEqual(parentLabels.map((_, index) => index + 1));
        },
      ),
    );
  });
});

describe('orderSetsForDisplay', () => {
  it('places every drop segment directly under its parent', () => {
    const ordered = orderSetsForDisplay([
      parent('a', 1),
      parent('b', 2),
      drop('a1', 'a', 1),
      drop('b1', 'b', 2),
    ]);
    expect(ordered.map((s) => s.id)).toEqual(['a', 'a1', 'b', 'b1']);
  });

  it('keeps orphaned segments at the end rather than dropping them', () => {
    const ordered = orderSetsForDisplay([parent('a', 1), drop('orphan', 'gone', 2)]);
    expect(ordered.map((s) => s.id)).toEqual(['a', 'orphan']);
  });
});

describe('isSessionStale - ADR-0005 stale-session policy', () => {
  const startedAt = Date.UTC(2026, 7, 6, 20, 0, 0);

  it('is false before the threshold and true at or after it', () => {
    expect(isSessionStale({ startedAt, now: startedAt + 5 * 3600_000, staleAfterHours: 6 })).toBe(
      false,
    );
    expect(isSessionStale({ startedAt, now: startedAt + 6 * 3600_000, staleAfterHours: 6 })).toBe(
      true,
    );
    expect(isSessionStale({ startedAt, now: startedAt + 14 * 3600_000, staleAfterHours: 6 })).toBe(
      true,
    );
  });

  it('is false for a clock that went backwards', () => {
    expect(isSessionStale({ startedAt, now: startedAt - 1000, staleAfterHours: 6 })).toBe(false);
  });
});
