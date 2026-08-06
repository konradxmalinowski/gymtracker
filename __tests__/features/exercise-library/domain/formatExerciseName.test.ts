import { formatExerciseName } from '@/features/exercise-library/domain/formatExerciseName';

describe('formatExerciseName()', () => {
  it('returns nameEn alone when there is no Polish name and no override', () => {
    expect(formatExerciseName({ nameEn: 'Bench Press', namePl: null })).toBe('Bench Press');
  });

  it('renders "English Name (Polska nazwa)" when a Polish translation exists', () => {
    expect(formatExerciseName({ nameEn: 'Bench Press', namePl: 'Wyciskanie sztangi lezac' })).toBe(
      'Bench Press (Wyciskanie sztangi lezac)',
    );
  });

  it('treats a whitespace-only namePl as absent', () => {
    expect(formatExerciseName({ nameEn: 'Bench Press', namePl: '   ' })).toBe('Bench Press');
  });

  it('an override wins outright, with no parenthetical, even when namePl is present', () => {
    expect(
      formatExerciseName({
        nameEn: 'Bench Press',
        namePl: 'Wyciskanie sztangi lezac',
        displayNameOverride: 'My Bench',
      }),
    ).toBe('My Bench');
  });

  it('an override wins outright when namePl is absent', () => {
    expect(
      formatExerciseName({
        nameEn: 'Bench Press',
        namePl: null,
        displayNameOverride: 'My Bench',
      }),
    ).toBe('My Bench');
  });

  it('treats a whitespace-only override as absent, falling back to the namePl rule', () => {
    expect(
      formatExerciseName({
        nameEn: 'Bench Press',
        namePl: 'Wyciskanie sztangi lezac',
        displayNameOverride: '   ',
      }),
    ).toBe('Bench Press (Wyciskanie sztangi lezac)');
  });

  it('returns the override exactly as typed, without trimming', () => {
    expect(
      formatExerciseName({
        nameEn: 'Bench Press',
        namePl: null,
        displayNameOverride: '  My Bench  ',
      }),
    ).toBe('  My Bench  ');
  });
});
