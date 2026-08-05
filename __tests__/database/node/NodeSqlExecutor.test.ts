import { createNodeDatabase, NodeSqlExecutor } from '@/database/node/NodeSqlExecutor';

function createDb(): NodeSqlExecutor {
  const raw = createNodeDatabase(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  const db = new NodeSqlExecutor(raw);
  raw.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT NOT NULL)');
  return db;
}

describe('NodeSqlExecutor', () => {
  it('runs INSERT/UPDATE/DELETE and reports changes', async () => {
    const db = createDb();
    const insert = await db.run('INSERT INTO t (name) VALUES (?)', ['a']);
    expect(insert.changes).toBe(1);

    const update = await db.run('UPDATE t SET name = ? WHERE name = ?', ['b', 'a']);
    expect(update.changes).toBe(1);

    const del = await db.run('DELETE FROM t WHERE name = ?', ['b']);
    expect(del.changes).toBe(1);
  });

  it('select returns all matching rows, selectOne returns the first or null', async () => {
    const db = createDb();
    await db.run('INSERT INTO t (name) VALUES (?)', ['a']);
    await db.run('INSERT INTO t (name) VALUES (?)', ['b']);

    const all = await db.select<{ name: string }>('SELECT name FROM t ORDER BY name');
    expect(all).toEqual([{ name: 'a' }, { name: 'b' }]);

    const one = await db.selectOne<{ name: string }>('SELECT name FROM t WHERE name = ?', ['a']);
    expect(one).toEqual({ name: 'a' });

    const none = await db.selectOne<{ name: string }>('SELECT name FROM t WHERE name = ?', [
      'missing',
    ]);
    expect(none).toBeNull();
  });

  it('batch runs every statement inside one transaction', async () => {
    const db = createDb();
    await db.batch([
      { sql: 'INSERT INTO t (name) VALUES (?)', params: ['a'] },
      { sql: 'INSERT INTO t (name) VALUES (?)', params: ['b'] },
    ]);
    const rows = await db.select('SELECT name FROM t ORDER BY name');
    expect(rows).toHaveLength(2);
  });

  it('commits a successful transaction', async () => {
    const db = createDb();
    const result = await db.transaction(async (tx) => {
      await tx.run('INSERT INTO t (name) VALUES (?)', ['a']);
      return 'ok';
    });
    expect(result).toBe('ok');
    const rows = await db.select('SELECT name FROM t');
    expect(rows).toHaveLength(1);
  });

  it('rolls back a failed transaction, leaving no partial writes', async () => {
    const db = createDb();
    await expect(
      db.transaction(async (tx) => {
        await tx.run('INSERT INTO t (name) VALUES (?)', ['a']);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const rows = await db.select('SELECT name FROM t');
    expect(rows).toHaveLength(0);
  });

  it('joins the outer transaction on nested transaction() calls', async () => {
    const db = createDb();
    const outerTxSeen: unknown[] = [];

    await db.transaction(async (outerTx) => {
      await outerTx.run('INSERT INTO t (name) VALUES (?)', ['a']);

      // A nested transaction() call must not open a second native transaction
      // (node:sqlite throws "cannot start a transaction within a transaction" if it
      // tries) - it must join the outer one and receive the same executor.
      await db.transaction(async (innerTx) => {
        outerTxSeen.push(innerTx);
        await innerTx.run('INSERT INTO t (name) VALUES (?)', ['b']);
      });
    });

    const rows = await db.select('SELECT name FROM t ORDER BY name');
    expect(rows).toEqual([{ name: 'a' }, { name: 'b' }]);
  });

  it('rolls back the entire outer transaction if a nested join fails', async () => {
    const db = createDb();
    await expect(
      db.transaction(async (outerTx) => {
        await outerTx.run('INSERT INTO t (name) VALUES (?)', ['a']);
        await db.transaction(async (innerTx) => {
          await innerTx.run('INSERT INTO t (name) VALUES (?)', ['b']);
          throw new Error('nested failure');
        });
      }),
    ).rejects.toThrow('nested failure');

    const rows = await db.select('SELECT name FROM t');
    expect(rows).toHaveLength(0);
  });

  it('reuses a cached prepared statement across repeated calls with the same SQL text', async () => {
    const raw = createNodeDatabase(':memory:');
    raw.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT NOT NULL)');
    const db = new NodeSqlExecutor(raw);
    const prepareSpy = jest.spyOn(raw, 'prepare');

    await db.run('INSERT INTO t (name) VALUES (?)', ['a']);
    await db.run('INSERT INTO t (name) VALUES (?)', ['b']);
    await db.run('INSERT INTO t (name) VALUES (?)', ['c']);

    expect(prepareSpy).toHaveBeenCalledTimes(1);
    prepareSpy.mockRestore();
  });
});
