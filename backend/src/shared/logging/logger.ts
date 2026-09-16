import { pino } from 'pino';
import type { DestinationStream, Logger, LoggerOptions } from 'pino';

import { currentTraceId } from './trace-context';
import { REDACTED } from './redact';

/** How the root logger is configured. Comes from validated environment, never from a default. */
export interface LoggerSettings {
  readonly level: string;
  readonly service: string;
}

/**
 * The root logger.
 *
 * JSON on stdout, in every environment. The field schema is the one the three ends share, which
 * is what makes a problem that starts on a phone and dies in a CLI subprocess one query instead
 * of an archaeological dig — see docs/architecture/shared/03-logging.md.
 *
 * `traceId` is added by a mixin rather than passed in at every call site: it lives in
 * `AsyncLocalStorage`, so the logger can read it and the domain never has to carry it.
 *
 * @param destination where the lines go; stdout when it is not given
 */
export function createRootLogger(
  settings: LoggerSettings,
  destination?: DestinationStream,
): Logger {
  const options: LoggerOptions = {
    level: settings.level,
    timestamp: pino.stdTimeFunctions.isoTime,
    base: { service: settings.service },
    formatters: { level: (label: string) => ({ level: label }) },
    mixin: () => {
      const traceId = currentTraceId();
      return traceId === null ? {} : { traceId };
    },
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      censor: REDACTED,
    },
  };

  return destination === undefined ? pino(options) : pino(options, destination);
}

export type { Logger };

/** DI token of the root logger. */
export const LOGGER = Symbol('Logger');
