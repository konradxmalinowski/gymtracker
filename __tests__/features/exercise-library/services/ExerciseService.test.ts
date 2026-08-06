import {
  EXERCISE_NAME_MAX_LENGTH,
  EXERCISE_NOTE_MAX_LENGTH,
  EXERCISE_REST_SECONDS_MAX,
  ExerciseService,
} from '@/features/exercise-library/services/ExerciseService';
import {
  ExerciseDeleteBlockedError,
  ExerciseValidationError,
} from '@/features/exercise-library/services/errors';
import { ExerciseNotEditableError } from '@/features/exercise-library/repository/errors';
import type {
  CreateCustomExerciseInput,
  Exercise,
  ExerciseListItem,
  ExerciseRepository,
  PlanReference,
} from '@/features/exercise-library/repository/ExerciseRepository';

/**
 * A hand-written fake, not the real `SqliteExerciseRepository` - this layer's
 * tests are about `ExerciseService`'s own validation and error-translation logic
 * (delete-guard, Zod input checks), which is exactly what
 * `__tests__/features/profile/services/ProfileService.test.ts`'s sibling test
 * exercises against a real repository for a different reason (avatar
 * write-then-commit needs a real filesystem); nothing here needs real SQL, so a
 * fake keeps the tests fast and focused, per this phase's task brief.
 */
function createFakeRepository(): jest.Mocked<ExerciseRepository> {
  return {
    search: jest.fn(),
    findById: jest.fn(),
    findByCatalogSlug: jest.fn(),
    createCustom: jest.fn(),
    updateCustom: jest.fn(),
    deleteCustom: jest.fn(),
    setFavorite: jest.fn(),
    setNote: jest.fn(),
    setDefaultRest: jest.fn(),
    listReferencingPlans: jest.fn(),
    replaceCatalog: jest.fn(),
  };
}

function buildService(repository: jest.Mocked<ExerciseRepository> = createFakeRepository()) {
  const service = new ExerciseService({ repository });
  return { service, repository };
}

const validCreateInput: CreateCustomExerciseInput = {
  nameEn: 'Cable Crossover',
  equipmentSlug: 'cable',
  muscles: [{ slug: 'chest', role: 'primary' }],
};

const fakeExercise: Exercise = {
  id: 'ex-1',
  source: 'custom',
  catalogSlug: null,
  nameEn: 'Cable Crossover',
  namePl: null,
  nameSearch: 'cable crossover',
  aliases: [],
  category: null,
  force: null,
  mechanic: null,
  level: null,
  equipmentSlug: 'cable',
  bodyPart: null,
  trackingType: 'weight_reps',
  instructions: [],
  images: [],
  createdAt: 0,
  updatedAt: 0,
  muscles: [{ slug: 'chest', role: 'primary' }],
  videos: [],
  userData: {
    isFavorite: false,
    favoritedAt: null,
    note: null,
    defaultRestSeconds: null,
    displayNameOverride: null,
    lastPerformedAt: null,
  },
};

describe('ExerciseService - read pass-through', () => {
  it('search() delegates to the repository unchanged', async () => {
    const { service, repository } = buildService();
    const results: ExerciseListItem[] = [];
    repository.search.mockResolvedValue(results);

    const query = { text: 'bench', limit: 20 };
    const result = await service.search(query);

    expect(repository.search).toHaveBeenCalledWith(query);
    expect(result).toBe(results);
  });

  it('getById() delegates to repository.findById()', async () => {
    const { service, repository } = buildService();
    repository.findById.mockResolvedValue(fakeExercise);

    expect(await service.getById('ex-1')).toBe(fakeExercise);
    expect(repository.findById).toHaveBeenCalledWith('ex-1');
  });

  it('getByCatalogSlug() delegates to repository.findByCatalogSlug()', async () => {
    const { service, repository } = buildService();
    repository.findByCatalogSlug.mockResolvedValue(fakeExercise);

    expect(await service.getByCatalogSlug('bench-press')).toBe(fakeExercise);
    expect(repository.findByCatalogSlug).toHaveBeenCalledWith('bench-press');
  });

  it('listReferencingPlans() delegates to the repository unchanged', async () => {
    const { service, repository } = buildService();
    const plans: PlanReference[] = [{ planId: 'p1', planName: 'Push Day' }];
    repository.listReferencingPlans.mockResolvedValue(plans);

    expect(await service.listReferencingPlans('ex-1')).toBe(plans);
  });
});

describe('ExerciseService.createCustom() - validation', () => {
  it('creates the exercise when input is valid', async () => {
    const { service, repository } = buildService();
    repository.createCustom.mockResolvedValue(fakeExercise);

    const result = await service.createCustom(validCreateInput);

    expect(repository.createCustom).toHaveBeenCalledWith(
      expect.objectContaining({ nameEn: 'Cable Crossover', equipmentSlug: 'cable' }),
    );
    expect(result).toBe(fakeExercise);
  });

  it('rejects an empty nameEn and never calls the repository', async () => {
    const { service, repository } = buildService();

    await expect(service.createCustom({ ...validCreateInput, nameEn: '' })).rejects.toBeInstanceOf(
      ExerciseValidationError,
    );
    expect(repository.createCustom).not.toHaveBeenCalled();
  });

  it('rejects a nameEn longer than EXERCISE_NAME_MAX_LENGTH', async () => {
    const { service } = buildService();
    const tooLong = 'x'.repeat(EXERCISE_NAME_MAX_LENGTH + 1);

    await expect(
      service.createCustom({ ...validCreateInput, nameEn: tooLong }),
    ).rejects.toBeInstanceOf(ExerciseValidationError);
  });

  it('accepts a nameEn exactly at EXERCISE_NAME_MAX_LENGTH', async () => {
    const { service, repository } = buildService();
    repository.createCustom.mockResolvedValue(fakeExercise);
    const atLimit = 'x'.repeat(EXERCISE_NAME_MAX_LENGTH);

    await expect(service.createCustom({ ...validCreateInput, nameEn: atLimit })).resolves.toBe(
      fakeExercise,
    );
  });

  it('rejects missing equipmentSlug and never calls the repository', async () => {
    const { service, repository } = buildService();
    const withoutEquipment: CreateCustomExerciseInput = {
      nameEn: 'Cable Crossover',
      muscles: [{ slug: 'chest', role: 'primary' }],
    };

    await expect(service.createCustom(withoutEquipment)).rejects.toBeInstanceOf(
      ExerciseValidationError,
    );
    expect(repository.createCustom).not.toHaveBeenCalled();
  });

  it('rejects an empty-string equipmentSlug', async () => {
    const { service } = buildService();

    await expect(
      service.createCustom({ ...validCreateInput, equipmentSlug: '' }),
    ).rejects.toBeInstanceOf(ExerciseValidationError);
  });

  it('rejects no muscles at all', async () => {
    const { service, repository } = buildService();

    await expect(service.createCustom({ ...validCreateInput, muscles: [] })).rejects.toBeInstanceOf(
      ExerciseValidationError,
    );
    expect(repository.createCustom).not.toHaveBeenCalled();
  });

  it('rejects muscles that are all secondary - at least one primary is required', async () => {
    const { service, repository } = buildService();

    await expect(
      service.createCustom({
        ...validCreateInput,
        muscles: [{ slug: 'triceps', role: 'secondary' }],
      }),
    ).rejects.toBeInstanceOf(ExerciseValidationError);
    expect(repository.createCustom).not.toHaveBeenCalled();
  });

  it('accepts a primary muscle plus optional secondary muscles', async () => {
    const { service, repository } = buildService();
    repository.createCustom.mockResolvedValue(fakeExercise);

    await expect(
      service.createCustom({
        ...validCreateInput,
        muscles: [
          { slug: 'chest', role: 'primary' },
          { slug: 'triceps', role: 'secondary' },
        ],
      }),
    ).resolves.toBe(fakeExercise);
  });
});

describe('ExerciseService.updateCustom() - validation', () => {
  it('passes a valid partial patch through to the repository', async () => {
    const { service, repository } = buildService();
    repository.updateCustom.mockResolvedValue(fakeExercise);

    await service.updateCustom('ex-1', { nameEn: 'New Name' });

    expect(repository.updateCustom).toHaveBeenCalledWith('ex-1', { nameEn: 'New Name' });
  });

  it('allows an empty patch (no fields touched)', async () => {
    const { service, repository } = buildService();
    repository.updateCustom.mockResolvedValue(fakeExercise);

    await expect(service.updateCustom('ex-1', {})).resolves.toBe(fakeExercise);
  });

  it('rejects patching nameEn to an empty string', async () => {
    const { service, repository } = buildService();

    await expect(service.updateCustom('ex-1', { nameEn: '' })).rejects.toBeInstanceOf(
      ExerciseValidationError,
    );
    expect(repository.updateCustom).not.toHaveBeenCalled();
  });

  it('rejects patching equipmentSlug to an empty string', async () => {
    const { service, repository } = buildService();

    await expect(service.updateCustom('ex-1', { equipmentSlug: '' })).rejects.toBeInstanceOf(
      ExerciseValidationError,
    );
    expect(repository.updateCustom).not.toHaveBeenCalled();
  });

  it('rejects a muscles patch with no primary muscle', async () => {
    const { service, repository } = buildService();

    await expect(
      service.updateCustom('ex-1', { muscles: [{ slug: 'triceps', role: 'secondary' }] }),
    ).rejects.toBeInstanceOf(ExerciseValidationError);
    expect(repository.updateCustom).not.toHaveBeenCalled();
  });

  it('propagates ExerciseNotEditableError from the repository unchanged (catalog-source exercise)', async () => {
    const { service, repository } = buildService();
    repository.updateCustom.mockRejectedValue(new ExerciseNotEditableError('catalog-ex-1'));

    await expect(service.updateCustom('catalog-ex-1', { nameEn: 'x' })).rejects.toBeInstanceOf(
      ExerciseNotEditableError,
    );
  });
});

describe('ExerciseService.deleteWithGuard()', () => {
  it('deletes when no plan references the exercise', async () => {
    const { service, repository } = buildService();
    repository.listReferencingPlans.mockResolvedValue([]);

    await service.deleteWithGuard('ex-1');

    expect(repository.deleteCustom).toHaveBeenCalledWith('ex-1');
  });

  it('throws ExerciseDeleteBlockedError carrying the blocking plans, and never calls deleteCustom', async () => {
    const { service, repository } = buildService();
    const plans: PlanReference[] = [
      { planId: 'p1', planName: 'Push Day' },
      { planId: 'p2', planName: 'Full Body' },
    ];
    repository.listReferencingPlans.mockResolvedValue(plans);

    let caught: unknown;
    try {
      await service.deleteWithGuard('ex-1');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ExerciseDeleteBlockedError);
    expect((caught as ExerciseDeleteBlockedError).blockingPlans).toEqual(plans);
    expect((caught as ExerciseDeleteBlockedError).exerciseId).toBe('ex-1');
    expect(repository.deleteCustom).not.toHaveBeenCalled();
  });

  it('propagates ExerciseNotEditableError from deleteCustom when the exercise is catalog-sourced and unreferenced', async () => {
    const { service, repository } = buildService();
    repository.listReferencingPlans.mockResolvedValue([]);
    repository.deleteCustom.mockRejectedValue(new ExerciseNotEditableError('catalog-ex-1'));

    await expect(service.deleteWithGuard('catalog-ex-1')).rejects.toBeInstanceOf(
      ExerciseNotEditableError,
    );
  });
});

describe('ExerciseService pass-through mutations', () => {
  it('setFavorite() delegates to the repository unchanged', async () => {
    const { service, repository } = buildService();
    await service.setFavorite('ex-1', true);
    expect(repository.setFavorite).toHaveBeenCalledWith('ex-1', true);
  });

  it('setNote() delegates a valid note to the repository', async () => {
    const { service, repository } = buildService();
    await service.setNote('ex-1', 'Feels good with a wider grip.');
    expect(repository.setNote).toHaveBeenCalledWith('ex-1', 'Feels good with a wider grip.');
  });

  it('setNote() accepts null (clearing the note)', async () => {
    const { service, repository } = buildService();
    await service.setNote('ex-1', null);
    expect(repository.setNote).toHaveBeenCalledWith('ex-1', null);
  });

  it('setNote() rejects a note longer than EXERCISE_NOTE_MAX_LENGTH', async () => {
    const { service, repository } = buildService();
    const tooLong = 'x'.repeat(EXERCISE_NOTE_MAX_LENGTH + 1);

    await expect(service.setNote('ex-1', tooLong)).rejects.toBeInstanceOf(ExerciseValidationError);
    expect(repository.setNote).not.toHaveBeenCalled();
  });

  it('setDefaultRest() delegates a valid value to the repository', async () => {
    const { service, repository } = buildService();
    await service.setDefaultRest('ex-1', 90);
    expect(repository.setDefaultRest).toHaveBeenCalledWith('ex-1', 90);
  });

  it('setDefaultRest() accepts null (clearing the override)', async () => {
    const { service, repository } = buildService();
    await service.setDefaultRest('ex-1', null);
    expect(repository.setDefaultRest).toHaveBeenCalledWith('ex-1', null);
  });

  it('setDefaultRest() rejects a negative value', async () => {
    const { service, repository } = buildService();
    await expect(service.setDefaultRest('ex-1', -1)).rejects.toBeInstanceOf(
      ExerciseValidationError,
    );
    expect(repository.setDefaultRest).not.toHaveBeenCalled();
  });

  it('setDefaultRest() rejects a non-integer value', async () => {
    const { service } = buildService();
    await expect(service.setDefaultRest('ex-1', 12.5)).rejects.toBeInstanceOf(
      ExerciseValidationError,
    );
  });

  it('setDefaultRest() rejects a value above EXERCISE_REST_SECONDS_MAX', async () => {
    const { service } = buildService();
    await expect(
      service.setDefaultRest('ex-1', EXERCISE_REST_SECONDS_MAX + 1),
    ).rejects.toBeInstanceOf(ExerciseValidationError);
  });

  it('setDefaultRest() accepts a value exactly at EXERCISE_REST_SECONDS_MAX', async () => {
    const { service, repository } = buildService();
    await service.setDefaultRest('ex-1', EXERCISE_REST_SECONDS_MAX);
    expect(repository.setDefaultRest).toHaveBeenCalledWith('ex-1', EXERCISE_REST_SECONDS_MAX);
  });
});
