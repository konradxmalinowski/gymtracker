import {
  camelToSnake,
  entityKeysToSnake,
  rowKeysToCamel,
  snakeToCamel,
} from '@/repositories/mapping';

describe('snakeToCamel / camelToSnake', () => {
  it('converts single and multi-underscore identifiers', () => {
    expect(snakeToCamel('created_at')).toBe('createdAt');
    expect(snakeToCamel('exercise_name_snapshot')).toBe('exerciseNameSnapshot');
    expect(snakeToCamel('id')).toBe('id');
  });

  it('round-trips through both directions', () => {
    expect(camelToSnake(snakeToCamel('target_rep_min'))).toBe('target_rep_min');
    expect(snakeToCamel(camelToSnake('targetRepMin'))).toBe('targetRepMin');
  });
});

describe('rowKeysToCamel / entityKeysToSnake', () => {
  it('converts every top-level key of a row object', () => {
    const row = { id: 'x', created_at: 1, is_favorite: 1 };
    expect(rowKeysToCamel(row)).toEqual({ id: 'x', createdAt: 1, isFavorite: 1 });
  });

  it('converts every top-level key of an entity object', () => {
    const entity = { id: 'x', createdAt: 1, isFavorite: true };
    expect(entityKeysToSnake(entity)).toEqual({ id: 'x', created_at: 1, is_favorite: true });
  });

  it('does not touch nested values, only top-level keys', () => {
    const row = { note_json: { innerKey: 'kept as-is' } };
    expect(rowKeysToCamel(row)).toEqual({ noteJson: { innerKey: 'kept as-is' } });
  });
});
