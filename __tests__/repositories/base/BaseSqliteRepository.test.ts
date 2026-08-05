import { createTestDatabase } from '@/database/node/createTestDatabase';
import type { NodeSqlExecutor } from '@/database/node/NodeSqlExecutor';
import { BaseSqliteRepository, RepositoryNotFoundError } from '@/repositories/base';
import type { AuditedRow } from '@/repositories/base';
import type { SqlExecutor, SqlParam } from '@/repositories/contracts/database';
import type { EntityId } from '@/repositories/contracts/repository';
import { FixedClock } from '@/services/clock';
import type { IdGenerator } from '@/services/id';

/**
 * `BaseSqliteRepository` is abstract and has no concrete subclass yet (every
 * real feature repository lands in P4+). This test-only repository over
 * `body_metric_entry` - a real table from `schema.sql` with the full audit +
 * soft-delete + local_date shape and no foreign keys to fixture around - exists
 * solely to exercise the base class's invariants end to end. It is not a
 * feature repository and is not exported outside this test file.
 */
interface BodyMetricRow extends AuditedRow {
  metric: string;
  value: number;
  measured_at: number;
  local_date: string;
  note: string | null;
}

interface BodyMetricEntity {
  id: string;
  metric: string;
  value: number;
  measuredAt: number;
  localDate: string;
  note: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

interface CreateBodyMetricInput {
  metric: string;
  value: number;
  measuredAt: number;
  note?: string | null;
}

interface UpdateBodyMetricInput {
  value?: number;
  note?: string | null;
}

class TestBodyMetricRepository extends BaseSqliteRepository<BodyMetricEntity, BodyMetricRow> {
  protected readonly table = 'body_metric_entry';

  protected mapRow(row: BodyMetricRow): BodyMetricEntity {
    return {
      id: row.id,
      metric: row.metric,
      value: row.value,
      measuredAt: row.measured_at,
      localDate: row.local_date,
      note: row.note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  }

  async create(input: CreateBodyMetricInput, tx?: SqlExecutor): Promise<BodyMetricEntity> {
    const { id } = await this.insertRow(
      {
        metric: input.metric,
        value: input.value,
        measured_at: input.measuredAt,
        note: input.note ?? null,
      },
      tx,
      { localDate: this.localDate(input.measuredAt) },
    );
    const entity = await this.findById(id, tx);
    if (!entity) {
      throw new Error('unreachable: row was just inserted');
    }
    return entity;
  }

  async update(
    id: EntityId,
    patch: UpdateBodyMetricInput,
    tx?: SqlExecutor,
  ): Promise<BodyMetricEntity> {
    const columns: Record<string, SqlParam> = {};
    if (patch.value !== undefined) {
      columns.value = patch.value;
    }
    if (patch.note !== undefined) {
      columns.note = patch.note;
    }
    await this.updateRow(id, columns, tx);
    const entity = await this.findById(id, tx);
    if (!entity) {
      throw new Error('unreachable: row was just updated');
    }
    return entity;
  }

  /** Bypasses the `deleted_at IS NULL` filter - test-only, to inspect raw row state. */
  async findByIdIncludingDeleted(id: EntityId, tx?: SqlExecutor): Promise<BodyMetricRow | null> {
    return this.executor(tx).selectOne<BodyMetricRow>(
      'SELECT * FROM body_metric_entry WHERE id = ?',
      [id],
    );
  }
}

function sequentialIdGenerator(prefix: string): IdGenerator {
  let counter = 0;
  return {
    generate: () => {
      counter += 1;
      return `${prefix}-${counter}`;
    },
  };
}

function buildRepository(db: NodeSqlExecutor, clock: FixedClock, idGenerator: IdGenerator) {
  return new TestBodyMetricRepository({ db, clock, idGenerator });
}

describe('BaseSqliteRepository - id generation', () => {
  it('create() persists the id produced by the injected IdGenerator', async () => {
    const db = createTestDatabase();
    const clock = new FixedClock(Date.UTC(2026, 0, 1, 12));
    const idGenerator = sequentialIdGenerator('bm');
    const repo = buildRepository(db, clock, idGenerator);

    const entity = await repo.create({
      metric: 'body_weight',
      value: 82.5,
      measuredAt: clock.now(),
    });

    expect(entity.id).toBe('bm-1');
    const second = await repo.create({
      metric: 'body_weight',
      value: 82.4,
      measuredAt: clock.now(),
    });
    expect(second.id).toBe('bm-2');
  });
});

describe('BaseSqliteRepository - updated_at maintenance (ADR-0004 mitigation note)', () => {
  it('bumps updated_at on create and again, strictly, on every subsequent update', async () => {
    const db = createTestDatabase();
    const clock = new FixedClock(Date.UTC(2026, 0, 1, 12));
    const repo = buildRepository(db, clock, sequentialIdGenerator('bm'));

    const created = await repo.create({ metric: 'waist', value: 80, measuredAt: clock.now() });
    expect(created.createdAt).toBe(clock.now());
    expect(created.updatedAt).toBe(clock.now());

    clock.advance(60_000);
    const updatedOnce = await repo.update(created.id, { value: 79.5 });
    expect(updatedOnce.updatedAt).toBe(clock.now());
    expect(updatedOnce.updatedAt).toBeGreaterThan(created.updatedAt);
    // create-time createdAt never changes on update.
    expect(updatedOnce.createdAt).toBe(created.createdAt);

    clock.advance(60_000);
    const updatedTwice = await repo.update(created.id, { note: 'after cut' });
    expect(updatedTwice.updatedAt).toBeGreaterThan(updatedOnce.updatedAt);
  });

  it('softDelete() and restore() also bump updated_at', async () => {
    const db = createTestDatabase();
    const clock = new FixedClock(Date.UTC(2026, 0, 1, 12));
    const repo = buildRepository(db, clock, sequentialIdGenerator('bm'));
    const created = await repo.create({ metric: 'chest', value: 100, measuredAt: clock.now() });

    clock.advance(1_000);
    await repo.softDelete(created.id);
    const afterDelete = await repo.findByIdIncludingDeleted(created.id);
    expect(afterDelete?.updated_at).toBe(clock.now());

    clock.advance(1_000);
    await repo.restore(created.id);
    const afterRestore = await repo.findByIdIncludingDeleted(created.id);
    expect(afterRestore?.updated_at).toBe(clock.now());
  });
});

describe('BaseSqliteRepository - local_date computation across a timezone boundary (ADR-0002 decision 2)', () => {
  // See __tests__/services/clock/Clock.test.ts for why this mocks
  // `Date.prototype`'s local getters instead of `process.env.TZ`: TZ env
  // mutation is not honored reliably by `Date` inside this project's Jest
  // environment, so it cannot be used to deterministically test a
  // cross-timezone boundary here.
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stores local_date from the injected Clock, not a naive UTC slice', async () => {
    // 23:30 UTC on Jan 1st. Simulate a device timezone (e.g. UTC+14) where
    // this instant has already rolled over to Jan 2nd locally.
    const instant = Date.UTC(2026, 0, 1, 23, 30, 0);
    jest.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026);
    jest.spyOn(Date.prototype, 'getMonth').mockReturnValue(0);
    jest.spyOn(Date.prototype, 'getDate').mockReturnValue(2);

    const db = createTestDatabase();
    const clock = new FixedClock(instant);
    const repo = buildRepository(db, clock, sequentialIdGenerator('bm'));

    const entity = await repo.create({ metric: 'body_weight', value: 80, measuredAt: instant });

    expect(entity.localDate).toBe('2026-01-02');
    // `toISOString` does not go through the mocked getters, so this is the
    // real, unaffected UTC date - proof the two genuinely disagree and the
    // stored local_date is the local one, not a naive UTC slice.
    expect(entity.localDate).not.toBe(new Date(instant).toISOString().slice(0, 10));
  });

  it('freezes local_date at the measurement instant, independent of when create() runs', async () => {
    // Pin the local calendar fields deterministically so this assertion does
    // not depend on the host machine's or CI runner's own configured
    // timezone (a host far enough ahead of UTC could otherwise push noon UTC
    // into the next local day and make this test flaky by environment).
    jest.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026);
    jest.spyOn(Date.prototype, 'getMonth').mockReturnValue(5);
    jest.spyOn(Date.prototype, 'getDate').mockReturnValue(1);

    const db = createTestDatabase();
    const clock = new FixedClock(Date.UTC(2026, 5, 10, 12));
    const repo = buildRepository(db, clock, sequentialIdGenerator('bm'));

    const backdatedInstant = Date.UTC(2026, 5, 1, 12);
    const entity = await repo.create({
      metric: 'body_weight',
      value: 80,
      measuredAt: backdatedInstant,
    });

    expect(entity.localDate).toBe('2026-06-01');
    expect(entity.createdAt).toBe(clock.now());
  });
});

describe('BaseSqliteRepository - soft-delete filtering (ADR-0002 decision 4)', () => {
  it('findById() excludes a soft-deleted row; restore() brings it back', async () => {
    const db = createTestDatabase();
    const clock = new FixedClock(Date.UTC(2026, 0, 1));
    const repo = buildRepository(db, clock, sequentialIdGenerator('bm'));
    const created = await repo.create({ metric: 'hips', value: 95, measuredAt: clock.now() });

    await repo.softDelete(created.id);
    expect(await repo.findById(created.id)).toBeNull();

    // The row itself is still physically present with deleted_at set.
    const raw = await repo.findByIdIncludingDeleted(created.id);
    expect(raw).not.toBeNull();
    expect(raw?.deleted_at).not.toBeNull();

    await repo.restore(created.id);
    const restored = await repo.findById(created.id);
    expect(restored).not.toBeNull();
    expect(restored?.deletedAt).toBeNull();
  });

  it('softDelete() is idempotent; softDelete() on an unknown id throws', async () => {
    const db = createTestDatabase();
    const clock = new FixedClock(Date.UTC(2026, 0, 1));
    const repo = buildRepository(db, clock, sequentialIdGenerator('bm'));
    const created = await repo.create({ metric: 'neck', value: 38, measuredAt: clock.now() });

    await repo.softDelete(created.id);
    await expect(repo.softDelete(created.id)).resolves.toBeUndefined();

    await expect(repo.softDelete('does-not-exist')).rejects.toBeInstanceOf(RepositoryNotFoundError);
  });

  it('restore() is idempotent on a row that is not deleted; restore() on an unknown id throws', async () => {
    const db = createTestDatabase();
    const clock = new FixedClock(Date.UTC(2026, 0, 1));
    const repo = buildRepository(db, clock, sequentialIdGenerator('bm'));
    const created = await repo.create({ metric: 'calf_left', value: 36, measuredAt: clock.now() });

    await expect(repo.restore(created.id)).resolves.toBeUndefined();
    await expect(repo.restore('does-not-exist')).rejects.toBeInstanceOf(RepositoryNotFoundError);
  });

  it('update() never resurrects a soft-deleted row', async () => {
    const db = createTestDatabase();
    const clock = new FixedClock(Date.UTC(2026, 0, 1));
    const repo = buildRepository(db, clock, sequentialIdGenerator('bm'));
    const created = await repo.create({
      metric: 'thigh_right',
      value: 55,
      measuredAt: clock.now(),
    });

    await repo.softDelete(created.id);
    await expect(repo.update(created.id, { value: 56 })).rejects.toBeInstanceOf(
      RepositoryNotFoundError,
    );
  });

  it('update() on an id that never existed throws RepositoryNotFoundError', async () => {
    const db = createTestDatabase();
    const clock = new FixedClock(Date.UTC(2026, 0, 1));
    const repo = buildRepository(db, clock, sequentialIdGenerator('bm'));

    await expect(repo.update('does-not-exist', { value: 1 })).rejects.toBeInstanceOf(
      RepositoryNotFoundError,
    );
  });
});

describe('BaseSqliteRepository - purge() as a genuinely separate hard-delete path (ADR-0002 decision 4)', () => {
  it('removes the row entirely - unlike softDelete, restore() cannot bring it back', async () => {
    const db = createTestDatabase();
    const clock = new FixedClock(Date.UTC(2026, 0, 1));
    const repo = buildRepository(db, clock, sequentialIdGenerator('bm'));
    const created = await repo.create({ metric: 'arm_left', value: 32, measuredAt: clock.now() });

    await repo.purge(created.id);

    expect(await repo.findById(created.id)).toBeNull();
    expect(await repo.findByIdIncludingDeleted(created.id)).toBeNull();
    await expect(repo.restore(created.id)).rejects.toBeInstanceOf(RepositoryNotFoundError);
  });

  it('purging a soft-deleted row also removes it entirely', async () => {
    const db = createTestDatabase();
    const clock = new FixedClock(Date.UTC(2026, 0, 1));
    const repo = buildRepository(db, clock, sequentialIdGenerator('bm'));
    const created = await repo.create({ metric: 'arm_right', value: 33, measuredAt: clock.now() });

    await repo.softDelete(created.id);
    await repo.purge(created.id);

    expect(await repo.findByIdIncludingDeleted(created.id)).toBeNull();
  });

  it('purging an id that never existed is a silent no-op, not an error', async () => {
    const db = createTestDatabase();
    const clock = new FixedClock(Date.UTC(2026, 0, 1));
    const repo = buildRepository(db, clock, sequentialIdGenerator('bm'));

    await expect(repo.purge('does-not-exist')).resolves.toBeUndefined();
  });
});

describe('BaseSqliteRepository - tx composition (ADR-0004: "single choke point ... composes a multi-repository write")', () => {
  it('a repository call passed an explicit tx participates in the caller-managed transaction', async () => {
    const db = createTestDatabase();
    const clock = new FixedClock(Date.UTC(2026, 0, 1));
    const repo = buildRepository(db, clock, sequentialIdGenerator('bm'));

    let createdId: string | undefined;
    await expect(
      db.transaction(async (tx) => {
        const entity = await repo.create(
          { metric: 'shoulders', value: 120, measuredAt: clock.now() },
          tx,
        );
        createdId = entity.id;
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    expect(createdId).toBeDefined();
    expect(await repo.findById(createdId as string)).toBeNull();
  });
});
