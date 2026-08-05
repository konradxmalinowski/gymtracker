import { RingBufferLogger, type RingBufferLoggerOptions } from './RingBufferLogger';
import type { Logger } from './Logger';

export function createLogger(options: RingBufferLoggerOptions = {}): Logger {
  return new RingBufferLogger(options);
}
