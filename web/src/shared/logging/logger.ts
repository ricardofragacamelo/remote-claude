import { pino } from 'pino';
import type { Logger } from 'pino';

import { config } from '@/shared/config/env';

/** Where a batch of log lines goes, and what a batch looks like on the way out. */
export interface LogShipper {
  send(lines: readonly unknown[]): void;
}

/** How the buffer behaves. Ten seconds or fifty lines, whichever comes first. */
export const BATCH_INTERVAL_MS = 10_000;
export const BATCH_SIZE = 50;

/** Levels that leave immediately: by the time a batch would flush, the page may be gone. */
const IMMEDIATE = new Set(['error', 'fatal']);

/**
 * Buffers log lines and ships them.
 *
 * Three rules, and each of them exists because of a specific failure:
 *
 * - a failed shipment never breaks the application — a logger that can take the page down is worse
 *   than no logger;
 * - the shipment itself is never logged, or the first failure becomes an infinite loop;
 * - the last batch leaves on `pagehide`, through `sendBeacon`, because the batch that matters most
 *   is the one from the crash.
 */
export class LogBuffer {
  private lines: unknown[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly shipper: LogShipper,
    private readonly size: number = BATCH_SIZE,
  ) {}

  /** Starts the periodic flush. */
  start(intervalMs: number = BATCH_INTERVAL_MS): void {
    this.timer ??= setInterval(() => {
      this.flush();
    }, intervalMs);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Takes one serialised line. */
  accept(line: string): void {
    let parsed: unknown;

    try {
      parsed = JSON.parse(line);
    } catch {
      // A line that will not parse is not worth taking the page down for.
      return;
    }

    this.lines.push(parsed);

    const level = (parsed as { level?: unknown }).level;
    if (this.lines.length >= this.size || (typeof level === 'string' && IMMEDIATE.has(level))) {
      this.flush();
    }
  }

  /** Ships whatever is buffered. Empty is a no-op. */
  flush(): void {
    if (this.lines.length === 0) {
      return;
    }

    const batch = this.lines;
    this.lines = [];

    try {
      this.shipper.send(batch);
    } catch {
      // Dropped on purpose, and silently: logging this failure would log the failure of logging.
    }
  }

  /** How many lines are waiting. */
  get pending(): number {
    return this.lines.length;
  }
}

/** Ships a batch to the backend, preferring the one transport that survives the page unloading. */
export function beaconShipper(endpoint: string): LogShipper {
  return {
    send: (lines) => {
      const body = JSON.stringify({ lines });

      if (typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
        return;
      }

      void fetch(endpoint, { method: 'POST', body, keepalive: true }).catch(() => undefined);
    },
  };
}

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
