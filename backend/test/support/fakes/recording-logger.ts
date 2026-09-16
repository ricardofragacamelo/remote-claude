import type { Logger } from 'pino';

import { createRootLogger } from '@shared/logging/logger';

/** One log line, as it was written. */
export interface LogLine {
  readonly level: string;
  readonly msg: string;
  readonly [field: string]: unknown;
}

/**
 * The real root logger, writing into an array.
 *
 * It is the production logger and not a stand-in on purpose: the redaction, the ISO timestamp and
 * the `traceId` mixin are part of what the tests are checking, and a hand-rolled double would not
 * have any of them.
 */
export class RecordingLogger {
  readonly lines: LogLine[] = [];
  readonly logger: Logger;

  constructor(level = 'trace') {
    this.logger = createRootLogger(
      { level, service: 'backend' },
      {
        write: (line: string) => {
          this.lines.push(JSON.parse(line) as LogLine);
        },
      },
    );
  }

  /** Every line written for a given `op`. */
  withOp(op: string): LogLine[] {
    return this.lines.filter((line) => line['op'] === op);
  }
}
