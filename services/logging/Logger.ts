/**
 * `Logger` - ADR-0014 part 2, "What exists regardless of that decision": a
 * 500-entry in-memory ring buffer plus an optional rolling file in the cache
 * directory, independent of whether opt-in crash reporting (Sentry) is ever
 * enabled. A later P15 feature builds "Export diagnostics" (redaction, sharing)
 * and the dev-only DB health screen's log panel on top of `getEntries()`/`toText()`;
 * this phase only owns the capture/eviction/rolling-file mechanics themselves.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  readonly level: LogLevel;
  readonly message: string;
  readonly timestamp: number;
  readonly context?: Record<string, unknown>;
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;

  /** A snapshot of the ring buffer, oldest entry first. */
  getEntries(): readonly LogEntry[];

  /** The ring buffer rendered as plain text, one line per entry. */
  toText(): string;
}
