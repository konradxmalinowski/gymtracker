import {
  ALWAYS,
  and,
  eq,
  inList,
  isNotNull,
  isNull,
  like,
  NEVER,
  or,
  toWhereSql,
} from '@/repositories/query';

describe('WhereClause primitives', () => {
  it('eq binds the value as a parameter, never interpolated', () => {
    const clause = eq('name', "Robert'); DROP TABLE exercise;--");
    expect(clause.sql).toBe('name = ?');
    expect(clause.params).toEqual(["Robert'); DROP TABLE exercise;--"]);
  });

  it('isNull / isNotNull take no parameters', () => {
    expect(isNull('deleted_at')).toEqual({ sql: 'deleted_at IS NULL', params: [] });
    expect(isNotNull('deleted_at')).toEqual({ sql: 'deleted_at IS NOT NULL', params: [] });
  });

  it('like binds the pattern as a parameter', () => {
    const clause = like('name_search', '%bench%');
    expect(clause.sql).toBe('name_search LIKE ?');
    expect(clause.params).toEqual(['%bench%']);
  });

  it('inList expands to one placeholder per value', () => {
    const clause = inList('equipment_slug', ['barbell', 'dumbbell']);
    expect(clause.sql).toBe('equipment_slug IN (?, ?)');
    expect(clause.params).toEqual(['barbell', 'dumbbell']);
  });

  it('inList with an empty list is NEVER, not invalid SQL or "matches everything"', () => {
    expect(inList('equipment_slug', [])).toBe(NEVER);
  });
});

describe('and() / or()', () => {
  it('and() combines multiple clauses with AND, flattening params in order', () => {
    const clause = and(eq('source', 'catalog'), isNull('deleted_at'));
    expect(clause.sql).toBe('(source = ?) AND (deleted_at IS NULL)');
    expect(clause.params).toEqual(['catalog']);
  });

  it('or() combines multiple clauses with OR', () => {
    const clause = or(eq('source', 'catalog'), eq('source', 'custom'));
    expect(clause.sql).toBe('(source = ?) OR (source = ?)');
    expect(clause.params).toEqual(['catalog', 'custom']);
  });

  it('skips null/undefined clauses (unset optional filters)', () => {
    const clause = and(eq('source', 'catalog'), null, undefined);
    expect(clause.sql).toBe('source = ?');
  });

  it('and() with no clauses is ALWAYS', () => {
    expect(and()).toBe(ALWAYS);
    expect(and(null, undefined)).toBe(ALWAYS);
  });

  it('and() with a single clause returns it unwrapped, no extra parens', () => {
    const clause = eq('id', 'abc');
    expect(and(clause)).toBe(clause);
  });
});

describe('toWhereSql', () => {
  it('renders a real clause with a WHERE prefix', () => {
    expect(toWhereSql(eq('id', 'abc'))).toBe('WHERE id = ?');
  });

  it('renders ALWAYS as an empty string', () => {
    expect(toWhereSql(ALWAYS)).toBe('');
    expect(toWhereSql(and())).toBe('');
  });
});
