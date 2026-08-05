import {
  boolFromSql,
  boolToSql,
  jsonFromSql,
  jsonParam,
  jsonToSql,
  nullableBoolFromSql,
  nullableBoolToSql,
} from '@/repositories/mapping';

describe('boolFromSql / boolToSql', () => {
  it('maps 1 <-> true and 0 <-> false', () => {
    expect(boolFromSql(1)).toBe(true);
    expect(boolFromSql(0)).toBe(false);
    expect(boolToSql(true)).toBe(1);
    expect(boolToSql(false)).toBe(0);
  });

  it('treats null/undefined as false (non-nullable variant)', () => {
    expect(boolFromSql(null)).toBe(false);
    expect(boolFromSql(undefined)).toBe(false);
  });
});

describe('nullableBoolFromSql / nullableBoolToSql', () => {
  it('preserves null rather than coercing to false', () => {
    expect(nullableBoolFromSql(null)).toBeNull();
    expect(nullableBoolFromSql(undefined)).toBeNull();
    expect(nullableBoolFromSql(1)).toBe(true);
    expect(nullableBoolFromSql(0)).toBe(false);
    expect(nullableBoolToSql(null)).toBeNull();
    expect(nullableBoolToSql(true)).toBe(1);
    expect(nullableBoolToSql(false)).toBe(0);
  });
});

describe('jsonFromSql / jsonToSql / jsonParam', () => {
  it('round-trips an array', () => {
    const encoded = jsonToSql(['a', 'b']);
    expect(jsonFromSql<string[]>(encoded, [])).toEqual(['a', 'b']);
  });

  it('falls back on a missing value', () => {
    expect(jsonFromSql(null, ['fallback'])).toEqual(['fallback']);
    expect(jsonFromSql(undefined, ['fallback'])).toEqual(['fallback']);
  });

  it('falls back on a corrupt value rather than throwing', () => {
    expect(() => jsonFromSql('not json{{', [])).not.toThrow();
    expect(jsonFromSql('not json{{', ['fallback'])).toEqual(['fallback']);
  });

  it('jsonParam produces the same encoding as jsonToSql', () => {
    expect(jsonParam({ a: 1 })).toBe(jsonToSql({ a: 1 }));
  });
});
