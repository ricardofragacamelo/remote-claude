import { Injectable } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';

import type { Logger } from './logger';

/**
 * Nest's own messages, written through our logger.
 *
 * Nest boots with a pretty printer of its own, which produces coloured prose on stdout beside the
 * JSON everything else emits. Two shapes in one stream is one shape nobody can query.
 */
@Injectable()
export class NestLoggerBridge implements LoggerService {
  constructor(private readonly logger: Logger) {}

  log(message: unknown, context?: unknown): void {
    this.write('info', message, context);
  }

  error(message: unknown, stack?: unknown, context?: unknown): void {
    this.logger.error(
      { op: 'nest', layer: 'infrastructure', nestContext: asText(context), stack: asText(stack) },
      asText(message),
    );
  }

  warn(message: unknown, context?: unknown): void {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: unknown): void {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: unknown): void {
    this.write('trace', message, context);
  }

  private write(
    level: 'info' | 'warn' | 'debug' | 'trace',
    message: unknown,
    context: unknown,
  ): void {
    this.logger[level](
      { op: 'nest', layer: 'infrastructure', nestContext: asText(context) },
      asText(message),
    );
  }
}

/** Nest passes strings, objects and the occasional `undefined`; the log wants one line of text. */
function asText(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }

  return typeof value === 'string' ? value : JSON.stringify(value);
}
