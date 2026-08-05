import { buildLimitOffset, buildOrderBy } from '@/repositories/query';

describe('buildOrderBy', () => {
  const ALLOWED = ['name_search', 'created_at'] as const;

  it('renders one or more validated columns with their direction', () => {
    expect(buildOrderBy([{ column: 'name_search', direction: 'ASC' }], ALLOWED)).toBe(
      'ORDER BY name_search ASC',
    );
    expect(
      buildOrderBy(
        [
          { column: 'created_at', direction: 'DESC' },
          { column: 'name_search', direction: 'ASC' },
        ],
        ALLOWED,
      ),
    ).toBe('ORDER BY created_at DESC, name_search ASC');
  });

  it('returns an empty string for no ordering', () => {
    expect(buildOrderBy([], ALLOWED)).toBe('');
  });

  it('rejects a column outside the whitelist rather than emitting it into SQL', () => {
    expect(() =>
      buildOrderBy([{ column: 'sql injection attempt; DROP TABLE x', direction: 'ASC' }], ALLOWED),
    ).toThrow(/not sortable/);
  });
});

describe('buildLimitOffset', () => {
  it('defaults to limit 20, offset 0', () => {
    const result = buildLimitOffset();
    expect(result.sql).toBe('LIMIT ? OFFSET ?');
    expect(result.params).toEqual([20, 0]);
    expect(result).toMatchObject({ limit: 20, offset: 0 });
  });

  it('honors an explicit limit/offset within bounds', () => {
    const result = buildLimitOffset({ limit: 50, offset: 100 });
    expect(result.params).toEqual([50, 100]);
  });

  it('clamps limit to the [1, 100] range - never unbounded', () => {
    expect(buildLimitOffset({ limit: 0 }).limit).toBe(1);
    expect(buildLimitOffset({ limit: -5 }).limit).toBe(1);
    expect(buildLimitOffset({ limit: 1000 }).limit).toBe(100);
  });

  it('clamps offset to >= 0', () => {
    expect(buildLimitOffset({ offset: -10 }).offset).toBe(0);
  });

  it('floors non-integer input', () => {
    expect(buildLimitOffset({ limit: 10.9 }).limit).toBe(10);
  });
});
