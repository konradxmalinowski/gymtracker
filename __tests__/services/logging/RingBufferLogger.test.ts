import { ExpoFileStorage } from '@/services/files';
import { createLogger, formatLogEntry, RingBufferLogger } from '@/services/logging';

describe('RingBufferLogger - in-memory ring buffer (ADR-0014 part 2)', () => {
  it('captures entries at every level with their message and level', () => {
    const logger = new RingBufferLogger();
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    const entries = logger.getEntries();
    expect(entries.map((entry) => entry.level)).toEqual(['debug', 'info', 'warn', 'error']);
    expect(entries.map((entry) => entry.message)).toEqual(['d', 'i', 'w', 'e']);
    expect(entries.every((entry) => typeof entry.timestamp === 'number')).toBe(true);
  });

  it('carries optional context through to the entry', () => {
    const logger = new RingBufferLogger();
    logger.error('boom', { code: 'E_BOOM' });
    expect(logger.getEntries()[0]?.context).toEqual({ code: 'E_BOOM' });
  });

  it('evicts the oldest entry once the default 500-entry capacity is exceeded', () => {
    const logger = new RingBufferLogger();
    for (let i = 0; i < 505; i += 1) {
      logger.info(`entry-${i}`);
    }

    const entries = logger.getEntries();
    expect(entries).toHaveLength(500);
    expect(entries[0]?.message).toBe('entry-5');
    expect(entries[499]?.message).toBe('entry-504');
  });

  it('respects a custom capacity', () => {
    const logger = new RingBufferLogger({ capacity: 3 });
    logger.info('a');
    logger.info('b');
    logger.info('c');
    logger.info('d');

    expect(logger.getEntries().map((entry) => entry.message)).toEqual(['b', 'c', 'd']);
  });

  it('toText() renders one formatted line per entry, oldest first', () => {
    const logger = new RingBufferLogger();
    logger.info('first');
    logger.warn('second');

    const lines = logger.toText().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('[INFO] first');
    expect(lines[1]).toContain('[WARN] second');
  });

  it('createLogger() builds a working Logger', () => {
    const logger = createLogger();
    logger.info('hello');
    expect(logger.getEntries()).toHaveLength(1);
  });
});

describe('RingBufferLogger - optional rolling file (ADR-0014 part 2)', () => {
  function uniqueLogPath(): string {
    return `logs/${Math.random().toString(36).slice(2)}.log`;
  }

  it('is in-memory only when no FileStorage is supplied - no error, nothing written', () => {
    const logger = new RingBufferLogger();
    expect(() => logger.info('no file backing')).not.toThrow();
  });

  it('appends each entry to the rolling file when a FileStorage is supplied', async () => {
    const fileStorage = new ExpoFileStorage('cache');
    const filePath = uniqueLogPath();
    const logger = new RingBufferLogger({ fileStorage, filePath });

    logger.info('first line');
    logger.warn('second line');

    // File writes are fire-and-forget; give the queued promises a tick to settle.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const content = await fileStorage.readText(filePath);
    expect(content).toContain('first line');
    expect(content).toContain('second line');
  });

  it('rotates the file once it exceeds maxFileBytes, discarding the oldest half', async () => {
    const fileStorage = new ExpoFileStorage('cache');
    const filePath = uniqueLogPath();
    const logger = new RingBufferLogger({ fileStorage, filePath, maxFileBytes: 200 });

    for (let i = 0; i < 30; i += 1) {
      logger.info(`padding line number ${i} to grow the rolling file past the byte limit`);
      // Rotation happens between writes, so each append must be allowed to
      // settle before the next one - sequential awaits are the point here.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const size = await fileStorage.size(filePath);
    expect(size).not.toBeNull();
    expect(size as number).toBeLessThan(30 * 60);

    const content = await fileStorage.readText(filePath);
    expect(content).toContain('padding line number 29');
    expect(content).not.toContain('padding line number 0 ');
  });

  it('formatLogEntry() includes an ISO timestamp, the level and the message', () => {
    const line = formatLogEntry({
      level: 'error',
      message: 'oops',
      timestamp: Date.UTC(2026, 0, 1),
    });
    expect(line).toContain('2026-01-01');
    expect(line).toContain('[ERROR]');
    expect(line).toContain('oops');
  });
});
