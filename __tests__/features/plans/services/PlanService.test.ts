import {
  PLAN_DAY_EXERCISE_NOTE_MAX_LENGTH,
  PLAN_DAY_NAME_MAX_LENGTH,
  PLAN_DAY_NOTE_MAX_LENGTH,
  PLAN_DESCRIPTION_MAX_LENGTH,
  PLAN_NAME_MAX_LENGTH,
  PlanService,
} from '@/features/plans/services/PlanService';
import { PlanValidationError, SupersetMinimumSizeError } from '@/features/plans/services/errors';
import { SupersetSpansMultipleDaysError } from '@/features/plans/repository/errors';
import { EXERCISE_REST_SECONDS_MAX } from '@/features/exercise-library';
import type { ExerciseListItem } from '@/features/exercise-library';
import type {
  AddPlanDayExerciseInput,
  CreatePlanInput,
  PlanAggregate,
  PlanDay,
  PlanDayExercise,
  PlanListItem,
  PlanRepository,
} from '@/features/plans/repository/PlanRepository';

/**
 * A hand-written fake, not the real `SqlitePlanRepository` - this layer's
 * tests are about `PlanService`'s own validation, disambiguation, and
 * delete-flow-routing logic, not real SQL. Mirrors
 * `__tests__/features/exercise-library/services/ExerciseService.test.ts`'s
 * precedent.
 */
function createFakeRepository(): jest.Mocked<PlanRepository> {
  return {
    listPlans: jest.fn(),
    getPlan: jest.fn(),
    createPlan: jest.fn(),
    renamePlan: jest.fn(),
    duplicatePlan: jest.fn(),
    setActivePlan: jest.fn(),
    reorderPlans: jest.fn(),
    addDay: jest.fn(),
    renameDay: jest.fn(),
    duplicateDay: jest.fn(),
    deleteDay: jest.fn(),
    restoreDay: jest.fn(),
    reorderDays: jest.fn(),
    addExerciseToDay: jest.fn(),
    updateDayExercise: jest.fn(),
    removeExerciseFromDay: jest.fn(),
    restoreDayExercise: jest.fn(),
    reorderDayExercises: jest.fn(),
    setSupersetGroup: jest.fn(),
    deletePlan: jest.fn(),
    restorePlan: jest.fn(),
    purgePlan: jest.fn(),
  };
}

function buildService(repository: jest.Mocked<PlanRepository> = createFakeRepository()) {
  const service = new PlanService({ repository });
  return { service, repository };
}

function fakePlanListItem(overrides: Partial<PlanListItem> = {}): PlanListItem {
  return {
    id: 'plan-1',
    name: 'Push Day',
    description: null,
    color: null,
    isActive: false,
    sortOrder: 0,
    dayCount: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function fakePlanAggregate(overrides: Partial<PlanAggregate> = {}): PlanAggregate {
  return {
    id: 'plan-1',
    name: 'Push Day',
    description: null,
    color: null,
    isActive: false,
    sortOrder: 0,
    createdAt: 0,
    updatedAt: 0,
    days: [],
    ...overrides,
  };
}

function fakePlanDay(overrides: Partial<PlanDay> = {}): PlanDay {
  return {
    id: 'day-1',
    planId: 'plan-1',
    name: 'Upper A',
    note: null,
    sortOrder: 0,
    createdAt: 0,
    updatedAt: 0,
    exercises: [],
    ...overrides,
  };
}

const fakeExerciseListItem: ExerciseListItem = {
  id: 'ex-1',
  source: 'catalog',
  catalogSlug: 'bench-press',
  nameEn: 'Bench Press',
  namePl: null,
  displayNameOverride: null,
  level: null,
  equipmentSlug: 'barbell',
  bodyPart: null,
  trackingType: 'weight_reps',
  primaryImage: null,
  isFavorite: false,
};

function fakePlanDayExercise(overrides: Partial<PlanDayExercise> = {}): PlanDayExercise {
  return {
    id: 'pde-1',
    planDayId: 'day-1',
    exerciseId: 'ex-1',
    sortOrder: 0,
    targetSets: null,
    targetRepMin: null,
    targetRepMax: null,
    targetRpe: null,
    restSeconds: null,
    supersetGroup: null,
    note: null,
    createdAt: 0,
    updatedAt: 0,
    exercise: fakeExerciseListItem,
    ...overrides,
  };
}

const validCreatePlanInput: CreatePlanInput = { name: 'Push Day' };
const validAddExerciseInput: AddPlanDayExerciseInput = { exerciseId: 'ex-1' };

describe('PlanService - read pass-through', () => {
  it('listPlans() delegates to the repository unchanged', async () => {
    const { service, repository } = buildService();
    const plans = [fakePlanListItem()];
    repository.listPlans.mockResolvedValue(plans);

    expect(await service.listPlans()).toBe(plans);
  });

  it('getPlan() delegates to the repository unchanged', async () => {
    const { service, repository } = buildService();
    const plan = fakePlanAggregate();
    repository.getPlan.mockResolvedValue(plan);

    expect(await service.getPlan('plan-1')).toBe(plan);
    expect(repository.getPlan).toHaveBeenCalledWith('plan-1');
  });
});

describe('PlanService.createPlan() - validation', () => {
  it('creates the plan when input is valid', async () => {
    const { service, repository } = buildService();
    const created = fakePlanAggregate();
    repository.createPlan.mockResolvedValue(created);

    const result = await service.createPlan(validCreatePlanInput);

    expect(repository.createPlan).toHaveBeenCalledWith(validCreatePlanInput);
    expect(result).toBe(created);
  });

  it('rejects an empty name and never calls the repository', async () => {
    const { service, repository } = buildService();

    await expect(service.createPlan({ name: '' })).rejects.toBeInstanceOf(PlanValidationError);
    expect(repository.createPlan).not.toHaveBeenCalled();
  });

  it('rejects a whitespace-only name', async () => {
    const { service, repository } = buildService();

    await expect(service.createPlan({ name: '   ' })).rejects.toBeInstanceOf(PlanValidationError);
    expect(repository.createPlan).not.toHaveBeenCalled();
  });

  it('rejects a name longer than PLAN_NAME_MAX_LENGTH', async () => {
    const { service } = buildService();
    const tooLong = 'x'.repeat(PLAN_NAME_MAX_LENGTH + 1);

    await expect(service.createPlan({ name: tooLong })).rejects.toBeInstanceOf(
      PlanValidationError,
    );
  });

  it('accepts a name exactly at PLAN_NAME_MAX_LENGTH', async () => {
    const { service, repository } = buildService();
    repository.createPlan.mockResolvedValue(fakePlanAggregate());
    const atLimit = 'x'.repeat(PLAN_NAME_MAX_LENGTH);

    await expect(service.createPlan({ name: atLimit })).resolves.toBeDefined();
  });

  it('rejects a description longer than PLAN_DESCRIPTION_MAX_LENGTH', async () => {
    const { service, repository } = buildService();
    const tooLong = 'x'.repeat(PLAN_DESCRIPTION_MAX_LENGTH + 1);

    await expect(
      service.createPlan({ name: 'Push Day', description: tooLong }),
    ).rejects.toBeInstanceOf(PlanValidationError);
    expect(repository.createPlan).not.toHaveBeenCalled();
  });

  it('accepts a null description and color', async () => {
    const { service, repository } = buildService();
    repository.createPlan.mockResolvedValue(fakePlanAggregate());

    await expect(
      service.createPlan({ name: 'Push Day', description: null, color: null }),
    ).resolves.toBeDefined();
  });

  it('rejects an empty-string color', async () => {
    const { service, repository } = buildService();

    await expect(
      service.createPlan({ name: 'Push Day', color: '' }),
    ).rejects.toBeInstanceOf(PlanValidationError);
    expect(repository.createPlan).not.toHaveBeenCalled();
  });
});

describe('PlanService.renamePlan() - validation', () => {
  it('renames with a valid name', async () => {
    const { service, repository } = buildService();
    await service.renamePlan('plan-1', 'Pull Day');
    expect(repository.renamePlan).toHaveBeenCalledWith('plan-1', 'Pull Day');
  });

  it('rejects an empty name and never calls the repository', async () => {
    const { service, repository } = buildService();

    await expect(service.renamePlan('plan-1', '')).rejects.toBeInstanceOf(PlanValidationError);
    expect(repository.renamePlan).not.toHaveBeenCalled();
  });
});

describe('PlanService.duplicatePlan() - name disambiguation', () => {
  it('keeps the repository-produced "(copy)" name when it does not collide with anything else', async () => {
    const { service, repository } = buildService();
    repository.duplicatePlan.mockResolvedValue(
      fakePlanAggregate({ id: 'plan-2', name: 'Push Day (copy)' }),
    );
    repository.listPlans.mockResolvedValue([
      fakePlanListItem({ id: 'plan-1', name: 'Push Day' }),
      fakePlanListItem({ id: 'plan-2', name: 'Push Day (copy)' }),
    ]);

    const result = await service.duplicatePlan('plan-1');

    expect(result.name).toBe('Push Day (copy)');
    expect(repository.renamePlan).not.toHaveBeenCalled();
  });

  it('disambiguates to "(copy 2)" when "(copy)" is already taken by another plan', async () => {
    const { service, repository } = buildService();
    repository.duplicatePlan.mockResolvedValue(
      fakePlanAggregate({ id: 'plan-3', name: 'Push Day (copy)' }),
    );
    repository.listPlans.mockResolvedValue([
      fakePlanListItem({ id: 'plan-1', name: 'Push Day' }),
      fakePlanListItem({ id: 'plan-2', name: 'Push Day (copy)' }),
      fakePlanListItem({ id: 'plan-3', name: 'Push Day (copy)' }),
    ]);

    const result = await service.duplicatePlan('plan-1');

    expect(repository.renamePlan).toHaveBeenCalledWith('plan-3', 'Push Day (copy 2)');
    expect(result.name).toBe('Push Day (copy 2)');
  });

  it('disambiguates to "(copy 3)" when "(copy)" and "(copy 2)" are both already taken', async () => {
    const { service, repository } = buildService();
    repository.duplicatePlan.mockResolvedValue(
      fakePlanAggregate({ id: 'plan-4', name: 'Push Day (copy)' }),
    );
    repository.listPlans.mockResolvedValue([
      fakePlanListItem({ id: 'plan-1', name: 'Push Day' }),
      fakePlanListItem({ id: 'plan-2', name: 'Push Day (copy)' }),
      fakePlanListItem({ id: 'plan-3', name: 'Push Day (copy 2)' }),
      fakePlanListItem({ id: 'plan-4', name: 'Push Day (copy)' }),
    ]);

    const result = await service.duplicatePlan('plan-1');

    expect(repository.renamePlan).toHaveBeenCalledWith('plan-4', 'Push Day (copy 3)');
    expect(result.name).toBe('Push Day (copy 3)');
  });

  it('disambiguates against the root name, not a compounded suffix, when duplicating a plan that is already a copy', async () => {
    const { service, repository } = buildService();
    // Duplicating "Push Day (copy)" itself: the repository always appends
    // " (copy)" again, producing "Push Day (copy) (copy)" - the service
    // should strip back to the root "Push Day" before disambiguating.
    repository.duplicatePlan.mockResolvedValue(
      fakePlanAggregate({ id: 'plan-3', name: 'Push Day (copy) (copy)' }),
    );
    repository.listPlans.mockResolvedValue([
      fakePlanListItem({ id: 'plan-1', name: 'Push Day' }),
      fakePlanListItem({ id: 'plan-2', name: 'Push Day (copy)' }),
      fakePlanListItem({ id: 'plan-3', name: 'Push Day (copy) (copy)' }),
    ]);

    const result = await service.duplicatePlan('plan-2');

    expect(repository.renamePlan).toHaveBeenCalledWith('plan-3', 'Push Day (copy 2)');
    expect(result.name).toBe('Push Day (copy 2)');
  });

  it('does not count the newly duplicated plan itself as a collision', async () => {
    const { service, repository } = buildService();
    repository.duplicatePlan.mockResolvedValue(
      fakePlanAggregate({ id: 'plan-2', name: 'Push Day (copy)' }),
    );
    // listPlans is queried after the repository already inserted plan-2 -
    // it must appear in the list but must not force a rename of itself.
    repository.listPlans.mockResolvedValue([
      fakePlanListItem({ id: 'plan-1', name: 'Push Day' }),
      fakePlanListItem({ id: 'plan-2', name: 'Push Day (copy)' }),
    ]);

    const result = await service.duplicatePlan('plan-1');

    expect(repository.renamePlan).not.toHaveBeenCalled();
    expect(result.name).toBe('Push Day (copy)');
  });
});

describe('PlanService.duplicateDay() - name disambiguation (scoped to the day\'s own plan)', () => {
  it('disambiguates to "(copy 2)" when "(copy)" is already taken by another day in the same plan', async () => {
    const { service, repository } = buildService();
    const newDay = fakePlanDay({ id: 'day-3', planId: 'plan-1', name: 'Upper A (copy)' });
    repository.duplicateDay.mockResolvedValue(newDay);
    repository.getPlan.mockResolvedValue(
      fakePlanAggregate({
        id: 'plan-1',
        days: [
          fakePlanDay({ id: 'day-1', planId: 'plan-1', name: 'Upper A' }),
          fakePlanDay({ id: 'day-2', planId: 'plan-1', name: 'Upper A (copy)' }),
          newDay,
        ],
      }),
    );

    const result = await service.duplicateDay('day-1');

    expect(repository.renameDay).toHaveBeenCalledWith('day-3', 'Upper A (copy 2)');
    expect(result.name).toBe('Upper A (copy 2)');
  });

  it('disambiguates against the root name when duplicating a day that is already a copy', async () => {
    const { service, repository } = buildService();
    const newDay = fakePlanDay({ id: 'day-3', planId: 'plan-1', name: 'Upper A (copy) (copy)' });
    repository.duplicateDay.mockResolvedValue(newDay);
    repository.getPlan.mockResolvedValue(
      fakePlanAggregate({
        id: 'plan-1',
        days: [
          fakePlanDay({ id: 'day-1', planId: 'plan-1', name: 'Upper A' }),
          fakePlanDay({ id: 'day-2', planId: 'plan-1', name: 'Upper A (copy)' }),
          newDay,
        ],
      }),
    );

    const result = await service.duplicateDay('day-2');

    expect(repository.renameDay).toHaveBeenCalledWith('day-3', 'Upper A (copy 2)');
    expect(result.name).toBe('Upper A (copy 2)');
  });

  it('does not count the newly duplicated day itself as a collision', async () => {
    const { service, repository } = buildService();
    const newDay = fakePlanDay({ id: 'day-2', planId: 'plan-1', name: 'Upper A (copy)' });
    repository.duplicateDay.mockResolvedValue(newDay);
    repository.getPlan.mockResolvedValue(
      fakePlanAggregate({
        id: 'plan-1',
        days: [fakePlanDay({ id: 'day-1', planId: 'plan-1', name: 'Upper A' }), newDay],
      }),
    );

    const result = await service.duplicateDay('day-1');

    expect(repository.renameDay).not.toHaveBeenCalled();
    expect(result.name).toBe('Upper A (copy)');
  });

  it('scopes the collision check to the day\'s own plan by calling getPlan(created.planId), never a global day listing', async () => {
    const { service, repository } = buildService();
    const newDay = fakePlanDay({ id: 'day-2', planId: 'plan-1', name: 'Upper A (copy)' });
    repository.duplicateDay.mockResolvedValue(newDay);
    repository.getPlan.mockResolvedValue(
      fakePlanAggregate({
        id: 'plan-1',
        days: [fakePlanDay({ id: 'day-1', planId: 'plan-1', name: 'Upper A' }), newDay],
      }),
    );

    await service.duplicateDay('day-1');

    // The whole point of plan-scoping: a same-named "(copy)" day sitting in
    // some other plan must never be consulted, because a day name is only
    // unique within its own plan - this asserts the service actually reads
    // its collision set from *this* plan (via `getPlan`), not from every
    // plan's days, which is what would make cross-plan collisions leak in.
    expect(repository.getPlan).toHaveBeenCalledWith('plan-1');
    expect(repository.listPlans).not.toHaveBeenCalled();
  });
});

describe('PlanService - delete flow routing', () => {
  it('deletePlan() calls purgePlan (hard delete), never the soft-deleting deletePlan/restorePlan pair', async () => {
    const { service, repository } = buildService();
    await service.deletePlan('plan-1');

    expect(repository.purgePlan).toHaveBeenCalledWith('plan-1');
    expect(repository.deletePlan).not.toHaveBeenCalled();
  });

  it('deleteDay() calls the repository soft delete, not purge', async () => {
    const { service, repository } = buildService();
    await service.deleteDay('day-1');

    expect(repository.deleteDay).toHaveBeenCalledWith('day-1');
    expect(repository.purgePlan).not.toHaveBeenCalled();
  });

  it('restoreDay() delegates to the repository unchanged', async () => {
    const { service, repository } = buildService();
    await service.restoreDay('day-1');
    expect(repository.restoreDay).toHaveBeenCalledWith('day-1');
  });

  it('removeExerciseFromDay() calls the repository soft delete', async () => {
    const { service, repository } = buildService();
    await service.removeExerciseFromDay('pde-1');
    expect(repository.removeExerciseFromDay).toHaveBeenCalledWith('pde-1');
  });

  it('restoreDayExercise() delegates to the repository unchanged', async () => {
    const { service, repository } = buildService();
    await service.restoreDayExercise('pde-1');
    expect(repository.restoreDayExercise).toHaveBeenCalledWith('pde-1');
  });
});

describe('PlanService.addDay() - validation', () => {
  it('adds a day with a valid name', async () => {
    const { service, repository } = buildService();
    const day = fakePlanDay();
    repository.addDay.mockResolvedValue(day);

    const result = await service.addDay('plan-1', { name: 'Upper A' });

    expect(repository.addDay).toHaveBeenCalledWith('plan-1', { name: 'Upper A' });
    expect(result).toBe(day);
  });

  it('rejects an empty day name', async () => {
    const { service, repository } = buildService();

    await expect(service.addDay('plan-1', { name: '' })).rejects.toBeInstanceOf(
      PlanValidationError,
    );
    expect(repository.addDay).not.toHaveBeenCalled();
  });

  it('rejects a day name longer than PLAN_DAY_NAME_MAX_LENGTH', async () => {
    const { service } = buildService();
    const tooLong = 'x'.repeat(PLAN_DAY_NAME_MAX_LENGTH + 1);

    await expect(service.addDay('plan-1', { name: tooLong })).rejects.toBeInstanceOf(
      PlanValidationError,
    );
  });

  it('rejects a note longer than PLAN_DAY_NOTE_MAX_LENGTH', async () => {
    const { service, repository } = buildService();
    const tooLong = 'x'.repeat(PLAN_DAY_NOTE_MAX_LENGTH + 1);

    await expect(
      service.addDay('plan-1', { name: 'Upper A', note: tooLong }),
    ).rejects.toBeInstanceOf(PlanValidationError);
    expect(repository.addDay).not.toHaveBeenCalled();
  });
});

describe('PlanService.renameDay() - validation', () => {
  it('rejects an empty name', async () => {
    const { service, repository } = buildService();
    await expect(service.renameDay('day-1', '')).rejects.toBeInstanceOf(PlanValidationError);
    expect(repository.renameDay).not.toHaveBeenCalled();
  });
});

describe('PlanService - day/day-exercise pass-throughs', () => {
  it('duplicateDay() delegates to the repository, keeping the name when there is no collision within the plan', async () => {
    const { service, repository } = buildService();
    const day = fakePlanDay({ id: 'day-2', name: 'Upper A (copy)' });
    repository.duplicateDay.mockResolvedValue(day);
    repository.getPlan.mockResolvedValue(
      fakePlanAggregate({
        id: 'plan-1',
        days: [fakePlanDay({ id: 'day-1', name: 'Upper A' }), day],
      }),
    );

    const result = await service.duplicateDay('day-1');

    expect(result.name).toBe('Upper A (copy)');
    expect(repository.renameDay).not.toHaveBeenCalled();
  });

  it('reorderDays() delegates to the repository unchanged', async () => {
    const { service, repository } = buildService();
    await service.reorderDays('plan-1', ['day-2', 'day-1']);
    expect(repository.reorderDays).toHaveBeenCalledWith('plan-1', ['day-2', 'day-1']);
  });

  it('reorderDayExercises() delegates to the repository unchanged', async () => {
    const { service, repository } = buildService();
    await service.reorderDayExercises('day-1', ['pde-2', 'pde-1']);
    expect(repository.reorderDayExercises).toHaveBeenCalledWith('day-1', ['pde-2', 'pde-1']);
  });

  it('setActivePlan() delegates to the repository unchanged', async () => {
    const { service, repository } = buildService();
    await service.setActivePlan('plan-1');
    expect(repository.setActivePlan).toHaveBeenCalledWith('plan-1');
  });

  it('reorderPlans() delegates to the repository unchanged', async () => {
    const { service, repository } = buildService();
    await service.reorderPlans(['plan-2', 'plan-1']);
    expect(repository.reorderPlans).toHaveBeenCalledWith(['plan-2', 'plan-1']);
  });
});

describe('PlanService.addExerciseToDay() - validation', () => {
  it('adds an exercise with valid target fields', async () => {
    const { service, repository } = buildService();
    const dayExercise = fakePlanDayExercise();
    repository.addExerciseToDay.mockResolvedValue(dayExercise);

    const input: AddPlanDayExerciseInput = {
      exerciseId: 'ex-1',
      targetSets: 5,
      targetRepMin: 8,
      targetRepMax: 12,
      targetRpe: 8.5,
      restSeconds: 90,
      note: 'Slow eccentric.',
    };
    const result = await service.addExerciseToDay('day-1', input);

    expect(repository.addExerciseToDay).toHaveBeenCalledWith('day-1', input);
    expect(result).toBe(dayExercise);
  });

  it('rejects a missing exerciseId', async () => {
    const { service, repository } = buildService();

    await expect(
      service.addExerciseToDay('day-1', { exerciseId: '' }),
    ).rejects.toBeInstanceOf(PlanValidationError);
    expect(repository.addExerciseToDay).not.toHaveBeenCalled();
  });

  it.each([0, 51, 1.5])('rejects an out-of-range targetSets value of %p', async (targetSets) => {
    const { service, repository } = buildService();

    await expect(
      service.addExerciseToDay('day-1', { ...validAddExerciseInput, targetSets }),
    ).rejects.toBeInstanceOf(PlanValidationError);
    expect(repository.addExerciseToDay).not.toHaveBeenCalled();
  });

  it.each([1, 50])('accepts a targetSets value of %p (CHECK constraint boundary)', async (targetSets) => {
    const { service, repository } = buildService();
    repository.addExerciseToDay.mockResolvedValue(fakePlanDayExercise());

    await expect(
      service.addExerciseToDay('day-1', { ...validAddExerciseInput, targetSets }),
    ).resolves.toBeDefined();
  });

  it.each([0.9, 10.1])('rejects an out-of-range targetRpe value of %p', async (targetRpe) => {
    const { service, repository } = buildService();

    await expect(
      service.addExerciseToDay('day-1', { ...validAddExerciseInput, targetRpe }),
    ).rejects.toBeInstanceOf(PlanValidationError);
    expect(repository.addExerciseToDay).not.toHaveBeenCalled();
  });

  it.each([1, 10, 7.5])('accepts a targetRpe value of %p (CHECK constraint boundary)', async (targetRpe) => {
    const { service, repository } = buildService();
    repository.addExerciseToDay.mockResolvedValue(fakePlanDayExercise());

    await expect(
      service.addExerciseToDay('day-1', { ...validAddExerciseInput, targetRpe }),
    ).resolves.toBeDefined();
  });

  it('rejects targetRepMin greater than targetRepMax', async () => {
    const { service, repository } = buildService();

    await expect(
      service.addExerciseToDay('day-1', {
        ...validAddExerciseInput,
        targetRepMin: 12,
        targetRepMax: 8,
      }),
    ).rejects.toBeInstanceOf(PlanValidationError);
    expect(repository.addExerciseToDay).not.toHaveBeenCalled();
  });

  it('accepts targetRepMin equal to targetRepMax', async () => {
    const { service, repository } = buildService();
    repository.addExerciseToDay.mockResolvedValue(fakePlanDayExercise());

    await expect(
      service.addExerciseToDay('day-1', {
        ...validAddExerciseInput,
        targetRepMin: 10,
        targetRepMax: 10,
      }),
    ).resolves.toBeDefined();
  });

  it('accepts targetRepMin without targetRepMax (and vice versa)', async () => {
    const { service, repository } = buildService();
    repository.addExerciseToDay.mockResolvedValue(fakePlanDayExercise());

    await expect(
      service.addExerciseToDay('day-1', { ...validAddExerciseInput, targetRepMin: 8 }),
    ).resolves.toBeDefined();
    await expect(
      service.addExerciseToDay('day-1', { ...validAddExerciseInput, targetRepMax: 12 }),
    ).resolves.toBeDefined();
  });

  it.each([0, -1])('rejects a restSeconds value of %p (negative/zero)', async (restSeconds) => {
    const { service, repository } = buildService();

    await expect(
      service.addExerciseToDay('day-1', { ...validAddExerciseInput, restSeconds }),
    ).rejects.toBeInstanceOf(PlanValidationError);
    expect(repository.addExerciseToDay).not.toHaveBeenCalled();
  });

  it('rejects a restSeconds value above EXERCISE_REST_SECONDS_MAX', async () => {
    const { service, repository } = buildService();

    await expect(
      service.addExerciseToDay('day-1', {
        ...validAddExerciseInput,
        restSeconds: EXERCISE_REST_SECONDS_MAX + 1,
      }),
    ).rejects.toBeInstanceOf(PlanValidationError);
    expect(repository.addExerciseToDay).not.toHaveBeenCalled();
  });

  it('accepts a restSeconds value of 1 and exactly EXERCISE_REST_SECONDS_MAX', async () => {
    const { service, repository } = buildService();
    repository.addExerciseToDay.mockResolvedValue(fakePlanDayExercise());

    await expect(
      service.addExerciseToDay('day-1', { ...validAddExerciseInput, restSeconds: 1 }),
    ).resolves.toBeDefined();
    await expect(
      service.addExerciseToDay('day-1', {
        ...validAddExerciseInput,
        restSeconds: EXERCISE_REST_SECONDS_MAX,
      }),
    ).resolves.toBeDefined();
  });

  it('rejects a note longer than PLAN_DAY_EXERCISE_NOTE_MAX_LENGTH', async () => {
    const { service, repository } = buildService();
    const tooLong = 'x'.repeat(PLAN_DAY_EXERCISE_NOTE_MAX_LENGTH + 1);

    await expect(
      service.addExerciseToDay('day-1', { ...validAddExerciseInput, note: tooLong }),
    ).rejects.toBeInstanceOf(PlanValidationError);
    expect(repository.addExerciseToDay).not.toHaveBeenCalled();
  });

  it('accepts null for every optional target field', async () => {
    const { service, repository } = buildService();
    repository.addExerciseToDay.mockResolvedValue(fakePlanDayExercise());

    const input: AddPlanDayExerciseInput = {
      exerciseId: 'ex-1',
      targetSets: null,
      targetRepMin: null,
      targetRepMax: null,
      targetRpe: null,
      restSeconds: null,
      note: null,
    };
    await expect(service.addExerciseToDay('day-1', input)).resolves.toBeDefined();
    expect(repository.addExerciseToDay).toHaveBeenCalledWith('day-1', input);
  });
});

describe('PlanService.updateDayExercise() - validation', () => {
  it('allows an empty patch (no fields touched)', async () => {
    const { service, repository } = buildService();
    repository.updateDayExercise.mockResolvedValue(fakePlanDayExercise());

    await expect(service.updateDayExercise('pde-1', {})).resolves.toBeDefined();
    expect(repository.updateDayExercise).toHaveBeenCalledWith('pde-1', {});
  });

  it('rejects an out-of-range targetSets in a patch', async () => {
    const { service, repository } = buildService();

    await expect(
      service.updateDayExercise('pde-1', { targetSets: 51 }),
    ).rejects.toBeInstanceOf(PlanValidationError);
    expect(repository.updateDayExercise).not.toHaveBeenCalled();
  });

  it('rejects a patch that would leave targetRepMin greater than targetRepMax', async () => {
    const { service, repository } = buildService();

    await expect(
      service.updateDayExercise('pde-1', { targetRepMin: 15, targetRepMax: 10 }),
    ).rejects.toBeInstanceOf(PlanValidationError);
    expect(repository.updateDayExercise).not.toHaveBeenCalled();
  });

  it('rejects a negative restSeconds in a patch', async () => {
    const { service, repository } = buildService();

    await expect(
      service.updateDayExercise('pde-1', { restSeconds: -30 }),
    ).rejects.toBeInstanceOf(PlanValidationError);
    expect(repository.updateDayExercise).not.toHaveBeenCalled();
  });

  it('propagates a repository error unchanged', async () => {
    const { service, repository } = buildService();
    repository.updateDayExercise.mockRejectedValue(new Error('not found'));

    await expect(service.updateDayExercise('pde-1', { targetSets: 5 })).rejects.toThrow(
      'not found',
    );
  });
});

describe('PlanService.setSupersetGroup() - minimum size', () => {
  it('groups 2 or more exercises', async () => {
    const { service, repository } = buildService();
    await service.setSupersetGroup(['pde-1', 'pde-2'], 1);
    expect(repository.setSupersetGroup).toHaveBeenCalledWith(['pde-1', 'pde-2'], 1);
  });

  it('groups more than 2 exercises', async () => {
    const { service, repository } = buildService();
    await service.setSupersetGroup(['pde-1', 'pde-2', 'pde-3'], 1);
    expect(repository.setSupersetGroup).toHaveBeenCalledWith(['pde-1', 'pde-2', 'pde-3'], 1);
  });

  it('rejects a single exercise id and never calls the repository', async () => {
    const { service, repository } = buildService();

    let caught: unknown;
    try {
      await service.setSupersetGroup(['pde-1'], 1);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(SupersetMinimumSizeError);
    expect((caught as SupersetMinimumSizeError).dayExerciseIds).toEqual(['pde-1']);
    expect(repository.setSupersetGroup).not.toHaveBeenCalled();
  });

  it('rejects an empty array of exercise ids', async () => {
    const { service, repository } = buildService();

    await expect(service.setSupersetGroup([], 1)).rejects.toBeInstanceOf(
      SupersetMinimumSizeError,
    );
    expect(repository.setSupersetGroup).not.toHaveBeenCalled();
  });

  it('allows a single id when clearing a group (group = null) - removing one exercise from a superset back to standalone is legitimate', async () => {
    const { service, repository } = buildService();

    await service.setSupersetGroup(['pde-1'], null);

    expect(repository.setSupersetGroup).toHaveBeenCalledWith(['pde-1'], null);
  });

  it('propagates SupersetSpansMultipleDaysError from the repository unchanged', async () => {
    const { service, repository } = buildService();
    repository.setSupersetGroup.mockRejectedValue(
      new SupersetSpansMultipleDaysError(['pde-1', 'pde-2']),
    );

    await expect(service.setSupersetGroup(['pde-1', 'pde-2'], 1)).rejects.toBeInstanceOf(
      SupersetSpansMultipleDaysError,
    );
  });
});
