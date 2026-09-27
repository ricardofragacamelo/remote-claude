import { pino } from 'pino';
import type { Logger } from 'pino';

import { config } from '@/shared/config/env';

/** Settings of the browser logger. */
export interface BrowserLoggerSettings {
  readonly level: string;
  readonly appVersion: string;
}

/**
 * The logger.
 *
 * Same field schema as the backend and the app — `service`, `op`, `traceId`, `durationMs` — which
 * is what turns a problem that starts on a click and dies in a CLI subprocess into one query.
 * See docs/architecture/shared/03-logging.md.
 */
export function createLogger(
  settings: BrowserLoggerSettings,
  destination?: { write(line: string): void },
): Logger {
  const options = {
    level: settings.level,
    timestamp: pino.stdTimeFunctions.isoTime,
    base: { service: 'web', appVersion: settings.appVersion },
    formatters: { level: (label: string) => ({ level: label }) },
    browser: { asObject: true },
  };

  return destination === undefined ? pino(options) : pino(options, destination);
}

/**
 * The level this build logs at.
 *
 * `debug` while developing — every I/O edge, with payloads. `info` in production, where the user
 * can turn `debug` back on from the UI: reproducing an intermittent permission bug needs it, and
 * having to ship a new build to investigate is not acceptable. Silent under the test runner, so a
 * suite's output is its assertions and not a transcript; the tests that examine a log build their
 * own logger with a destination they can read.
 */
export function defaultLevel(mode: string, isDevelopment: boolean): string {
  if (mode === 'test') {
    return 'silent';
  }

  return isDevelopment ? 'debug' : 'info';
}

/** The logger of this build. */
export const logger: Logger = createLogger({
  level: defaultLevel(import.meta.env.MODE, import.meta.env.DEV),
  appVersion: config.appVersion,
});
