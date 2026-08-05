import type { FileStorage } from '@/services/files';
import type { LogEntry, Logger, LogLevel } from './Logger';

const DEFAULT_CAPACITY = 500;
const DEFAULT_FILE_PATH = 'logs/app.log';
const DEFAULT_MAX_FILE_BYTES = 256 * 1024;

export interface RingBufferLoggerOptions {
  /** Ring buffer size. Defaults to 500 (ADR-0014 part 2). */
  capacity?: number;
  /**
   * Optional rolling-file target (ADR-0014 part 2: "an optional rolling file in
   * the cache directory"). When omitted, the logger is in-memory only - every
   * `Logger` call still works, nothing is ever written to disk.
   */
  fileStorage?: FileStorage;
  filePath?: string;
  /** Once the rolling file exceeds this size, its oldest half is discarded. */
  maxFileBytes?: number;
}

export function formatLogEntry(entry: LogEntry): string {
  const timestamp = new Date(entry.timestamp).toISOString();
  const context = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
  return `${timestamp} [${entry.level.toUpperCase()}] ${entry.message}${context}`;
}

/**
 * Default `Logger`: a fixed-capacity in-memory ring buffer (oldest entry
 * evicted first) plus a best-effort rolling file append.
 *
 * File IO is fire-and-forget by design: a logging call must never throw, block
 * the caller on disk IO, or (per ADR-0014) risk taking down the very code path
 * it is trying to record a failure from.
 */
export class RingBufferLogger implements Logger {
  private readonly capacity: number;
  private readonly entries: LogEntry[] = [];
  private readonly fileStorage: FileStorage | undefined;
  private readonly filePath: string;
  private readonly maxFileBytes: number;

  /** Serializes rotation + append so concurrent log calls don't race on the same file. */
  private fileQueue: Promise<void> = Promise.resolve();

  constructor(options: RingBufferLoggerOptions = {}) {
    this.capacity = options.capacity ?? DEFAULT_CAPACITY;
    this.fileStorage = options.fileStorage;
    this.filePath = options.filePath ?? DEFAULT_FILE_PATH;
    this.maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.record('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.record('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.record('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.record('error', message, context);
  }

  getEntries(): readonly LogEntry[] {
    return [...this.entries];
  }

  toText(): string {
    return this.entries.map(formatLogEntry).join('\n');
  }

  private record(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: Date.now(),
      ...(context ? { context } : {}),
    };

    this.entries.push(entry);
    if (this.entries.length > this.capacity) {
      this.entries.shift();
    }

    this.appendToFile(entry);
  }

  private appendToFile(entry: LogEntry): void {
    const fileStorage = this.fileStorage;
    if (!fileStorage) {
      return;
    }
    const line = `${formatLogEntry(entry)}\n`;
    this.fileQueue = this.fileQueue
      .then(() => this.rotateIfNeeded(fileStorage))
      .then(() => fileStorage.appendText(this.filePath, line))
      .catch(() => {
        // Never let a logging failure surface to the caller.
      });
  }

  private async rotateIfNeeded(fileStorage: FileStorage): Promise<void> {
    const currentSize = await fileStorage.size(this.filePath);
    if (currentSize === null || currentSize <= this.maxFileBytes) {
      return;
    }
    const content = (await fileStorage.readText(this.filePath)) ?? '';
    const tail = content.slice(Math.floor(content.length / 2));
    const firstLineBreak = tail.indexOf('\n');
    const trimmed = firstLineBreak === -1 ? tail : tail.slice(firstLineBreak + 1);
    await fileStorage.writeText(this.filePath, trimmed);
  }
}
